<?php

namespace Astro\Trail\Pricing;

use Astro\Trail\Enums\SpanType;
use Illuminate\Contracts\Config\Repository;
use Illuminate\Database\ConnectionResolverInterface;
use Illuminate\Support\Carbon;
use Throwable;

class PriceBook
{
    /**
     * What may follow a listed model id for a variant to share its rates: "-latest",
     * a date (-20251001, -2025-08-07, -08-2024) or a short build number (-001, -2512).
     */
    public const VERSION_SUFFIX = '/^-(latest|\d{8}|\d{4}-\d{2}-\d{2}|\d{2}-\d{4}|\d{3,4})$/';

    /**
     * How long stored prices are kept before the next lookup reads them again,
     * whether the last read worked or failed.
     */
    public const REFRESH_SECONDS = 60;

    /** @var array<string, array<string, Rate>>|null */
    private ?array $rows = null;

    private ?int $loadedAt = null;

    public function __construct(
        private readonly Repository $config,
        private readonly ConnectionResolverInterface $resolver,
        private readonly ?string $connection = null,
    ) {}

    public function rateFor(string $provider, string $model): ?Rate
    {
        return $this->resolve($provider, $model)->rate;
    }

    /**
     * How a model's rate is found, and where it comes from. With $withoutOwnRow the model's own
     * saved row is left out, which shows what a reset would return it to; other models' saved rows
     * still count, since a prefix can resolve through one.
     */
    public function resolve(string $provider, string $model, bool $withoutOwnRow = false): Resolution
    {
        $table = $this->table($provider, $withoutOwnRow ? $model : null);

        if (isset($table[$model])) {
            return new Resolution($table[$model], $table[$model]->custom ? PriceSource::Saved : PriceSource::Config);
        }

        $best = null;

        foreach ($table as $key => $rate) {
            $key = (string) $key;

            if (! str_starts_with($model, $key)) {
                continue;
            }

            if (preg_match(self::VERSION_SUFFIX, substr($model, strlen($key))) !== 1) {
                continue;
            }

            if ($best === null || strlen($key) > strlen($best->model)) {
                $best = $rate;
            }
        }

        return $best === null ? new Resolution(null, PriceSource::None) : new Resolution($best, PriceSource::Prefix);
    }

    /**
     * Drops the stored prices so the next lookup reads them again.
     */
    public function flush(): void
    {
        $this->rows = null;
        $this->loadedAt = null;
    }

    /**
     * @return list<array{provider: string, model: string}>
     */
    public function knownModels(): array
    {
        return array_map(
            fn (array $entry) => ['provider' => $entry['provider'], 'model' => $entry['model']],
            $this->catalogue(),
        );
    }

    /**
     * The same models as knownModels(), each with whether a step or an embedding was recorded with it.
     *
     * @return list<array{provider: string, model: string, observed: bool}>
     */
    public function catalogue(): array
    {
        $known = [];

        $add = function (string $provider, string $model, bool $observed) use (&$known): void {
            $key = $provider."\0".$model;
            $known[$key] = ['provider' => $provider, 'model' => $model, 'observed' => $observed || ($known[$key]['observed'] ?? false)];
        };

        $pricing = $this->config->get('trail.pricing');

        foreach (is_array($pricing) ? $pricing : [] as $provider => $models) {
            foreach (is_array($models) ? $models : [] as $model => $_) {
                $add((string) $provider, (string) $model, false);
            }
        }

        foreach ($this->databaseRows() as $provider => $models) {
            foreach ($models as $model => $_) {
                $add((string) $provider, (string) $model, false);
            }
        }

        try {
            $connection = $this->resolver->connection($this->connection);

            $observed = $connection->transaction(fn () => $connection
                ->table('trail_spans')
                ->whereIn('type', [SpanType::Step->value, SpanType::Embedding->value])
                ->whereNotNull('provider')
                ->whereNotNull('model')
                ->distinct()
                ->get(['provider', 'model']));

            foreach ($observed as $row) {
                if (is_string($row->provider) && is_string($row->model)) {
                    $add($row->provider, $row->model, true);
                }
            }
        } catch (Throwable $e) {
            report($e);
        }

        $known = array_values($known);

        usort($known, fn (array $a, array $b) => strcmp($a['provider'], $b['provider']) ?: strcmp($a['model'], $b['model']));

        return $known;
    }

    /**
     * @param  ?string  $withoutSaved  a model whose saved row is left out
     * @return array<string, Rate>
     */
    private function table(string $provider, ?string $withoutSaved = null): array
    {
        $pricing = $this->config->get('trail.pricing');
        $entries = is_array($pricing) ? ($pricing[$provider] ?? null) : null;
        $table = [];

        foreach (is_array($entries) ? $entries : [] as $model => $entry) {
            if (is_array($entry)) {
                $table[(string) $model] = $this->rate($provider, (string) $model, $entry, false);
            }
        }

        $saved = $this->databaseRows()[$provider] ?? [];

        if ($withoutSaved !== null) {
            unset($saved[$withoutSaved]);
        }

        return array_replace($table, $saved);
    }

    /**
     * @return array<string, array<string, Rate>>
     */
    private function databaseRows(): array
    {
        $now = Carbon::now()->getTimestamp();

        if ($this->rows !== null && $this->loadedAt !== null && $now - $this->loadedAt <= self::REFRESH_SECONDS) {
            return $this->rows;
        }

        $this->rows = [];
        $this->loadedAt = $now;

        try {
            // A savepoint when nested, so a failed read cannot abort the caller's transaction.
            $connection = $this->resolver->connection($this->connection);
            $rows = $connection->transaction(fn () => $connection->table('trail_prices')->get());
            $loaded = [];

            foreach ($rows as $row) {
                $entry = (array) $row;
                $provider = $entry['provider'] ?? null;
                $model = $entry['model'] ?? null;

                if (is_string($provider) && is_string($model)) {
                    $loaded[$provider][$model] = $this->rate($provider, $model, $entry, true);
                }
            }

            $this->rows = $loaded;
        } catch (Throwable $e) {
            report($e);
        }

        return $this->rows;
    }

    /**
     * @param  array<array-key, mixed>  $entry
     */
    private function rate(string $provider, string $model, array $entry, bool $custom): Rate
    {
        return new Rate(
            $provider,
            $model,
            $this->number($entry['input'] ?? null),
            $this->number($entry['output'] ?? null),
            $this->number($entry['cache_read'] ?? null),
            $this->number($entry['cache_write'] ?? null),
            $custom,
            $custom ? $this->moment($entry['updated_at'] ?? null) : null,
        );
    }

    private function moment(mixed $value): ?Carbon
    {
        try {
            return is_string($value) && $value !== '' ? Carbon::parse($value) : null;
        } catch (Throwable) {
            return null;
        }
    }

    private function number(mixed $value): ?float
    {
        if (! is_int($value) && ! is_float($value) && ! (is_string($value) && is_numeric($value))) {
            return null;
        }

        $number = (float) $value;

        return is_finite($number) && $number >= 0 ? $number : null;
    }
}
