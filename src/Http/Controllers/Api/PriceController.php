<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\PriceResource;
use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Pricing\RateInput;
use Astro\Trail\Queries\RawQuery;
use Astro\Trail\Storage\Models\Price;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use JsonException;
use stdClass;

/**
 * A model's saved price is its row of the prices table. Models are never created here: only one the
 * price book lists (config, saved rows, observed usage) can be written. A write changes what the
 * next run is priced at and nothing already recorded.
 */
class PriceController
{
    /** The width of the provider and model columns, in characters. */
    private const MAX_LENGTH = 255;

    public function update(Request $request, PriceBook $prices): JsonResponse
    {
        [$provider, $model, $observed] = $this->known($request, $prices);

        $rates = RateInput::from($this->body($request));

        $this->save($provider, $model, $rates);

        return $this->price($prices, $provider, $model, $observed);
    }

    public function destroy(Request $request, PriceBook $prices): JsonResponse
    {
        [$provider, $model, $observed] = $this->known($request, $prices);

        // A database that compares text loosely (MySQL) finds the row of another spelling too, and
        // that one is another model's price.
        foreach (Price::query()->where('provider', $provider)->where('model', $model)->get() as $row) {
            if ($row->provider === $provider && $row->model === $model) {
                $row->delete();
            }
        }

        return $this->price($prices, $provider, $model, $observed);
    }

    /**
     * The model of the query, spelled as the price book lists it. A provider or a model that a column
     * could not hold, or that the book does not list, is no model and is a 404; the first kind is
     * answered without reading the database.
     *
     * @return array{0: string, 1: string, 2: bool}
     */
    private function known(Request $request, PriceBook $prices): array
    {
        $provider = RawQuery::string($request, 'provider');
        $model = RawQuery::string($request, 'model');

        abort_unless($provider !== null && $model !== null && self::possible($provider) && self::possible($model), 404);

        // These endpoints read the prices fresh, not the copy this process holds for a minute: another
        // worker may have saved or reset one, and the list must show what the table holds.
        $prices->flush();

        foreach ($prices->catalogue() as $entry) {
            if ($entry['provider'] === $provider && $entry['model'] === $model) {
                return [$entry['provider'], $entry['model'], $entry['observed']];
            }
        }

        abort(404);
    }

    /**
     * The JSON object of the request, decoded from its content so that `{}` (every rate blank) can be
     * told from a list, from a failure and from no body at all.
     *
     * @return array<array-key, mixed>
     *
     * @throws ValidationException when the body is not a JSON object
     */
    private function body(Request $request): array
    {
        $decoded = null;

        if ($request->isJson()) {
            try {
                $decoded = json_decode($request->getContent(), false, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                $decoded = null;
            }
        }

        if (! $decoded instanceof stdClass) {
            throw ValidationException::withMessages(['body' => ['The body must be a JSON object.']]);
        }

        return get_object_vars($decoded);
    }

    private static function possible(string $text): bool
    {
        return $text !== '' && ! str_contains($text, "\0") && mb_check_encoding($text, 'UTF-8') && mb_strlen($text) <= self::MAX_LENGTH;
    }

    /**
     * @param  array<string, ?string>  $rates
     *
     * @throws ValidationException when a row of another spelling holds the model's place
     */
    private function save(string $provider, string $model, array $rates): void
    {
        $connection = (new Price)->getConnection();

        // Two requests that create the row together meet on the unique index; the second reads the first one's
        // row. Each attempt is a transaction of its own (a savepoint when nested), which a failed insert
        // rolls back, since Postgres refuses every statement after one in the same transaction.
        for ($attempt = 1; ; $attempt++) {
            try {
                $connection->transaction(fn () => $this->write($provider, $model, $rates));

                return;
            } catch (UniqueConstraintViolationException $e) {
                if ($attempt >= 2) {
                    throw $e;
                }
            }
        }
    }

    /**
     * @param  array<string, ?string>  $rates
     *
     * @throws ValidationException when a row of another spelling holds the model's place
     */
    private function write(string $provider, string $model, array $rates): void
    {
        $row = Price::query()->where('provider', $provider)->where('model', $model)->first();

        // MySQL's unique index ignores case, so it would take this write for the other spelling's.
        if ($row !== null && ($row->provider !== $provider || $row->model !== $model)) {
            throw ValidationException::withMessages([
                'model' => ["A price is already saved as [{$row->provider}] [{$row->model}], which this database takes for the same model. Reset that one first."],
            ]);
        }

        $row ??= new Price(['provider' => $provider, 'model' => $model]);

        $row->fill($rates);

        if ($row->exists) {
            // Saving the same rates again is still a save: the moment is when it was last written.
            $row->setUpdatedAt(Carbon::now());
        }

        $row->save();
    }

    private function price(PriceBook $prices, string $provider, string $model, bool $observed): JsonResponse
    {
        // This process resolves the new price at once; another one reads it at most PriceBook::REFRESH_SECONDS later.
        $prices->flush();

        return response()->json(['data' => PriceResource::of($prices, $provider, $model, $observed)]);
    }
}
