<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Http\Resources\Timestamp;
use Astro\Trail\Storage\StaleRuns;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * The window of time a request asks about, on when a run started: from included, to excluded.
 */
final readonly class TimeRange
{
    public const DEFAULT_PRESET = '24h';

    /** @var array<string, int> preset => the hours it reaches back from now */
    public const PRESETS = ['1h' => 1, '24h' => 24, '7d' => 168];

    public function __construct(public ?string $preset, public CarbonImmutable $from, public CarbonImmutable $to) {}

    /**
     * @throws ValidationException when the range is not one of the accepted forms
     */
    public static function fromRequest(Request $request): self
    {
        $range = self::parameter($request, 'range');
        $from = self::parameter($request, 'from');
        $to = self::parameter($request, 'to');

        if ($range !== null && ($from !== null || $to !== null)) {
            throw ValidationException::withMessages(['range' => 'The range cannot be sent together with from or to.']);
        }

        if ($from === null && $to === null) {
            $range ??= self::DEFAULT_PRESET;

            if (! is_string($range) || ! isset(self::PRESETS[$range])) {
                throw ValidationException::withMessages(['range' => 'The range must be 1h, 24h or 7d.']);
            }

            $now = Carbon::now()->toImmutable();

            return new self($range, $now->subHours(self::PRESETS[$range]), $now);
        }

        foreach (['from' => $from, 'to' => $to] as $name => $value) {
            if ($value === null) {
                throw ValidationException::withMessages([$name => "The {$name} is required with the other bound."]);
            }
        }

        $from = self::moment('from', $from);
        $to = self::moment('to', $to);

        if ($from >= $to) {
            throw ValidationException::withMessages(['from' => 'The from must be before the to.']);
        }

        return new self(null, $from, $to);
    }

    /**
     * Keep the rows whose column is inside the range.
     *
     * @param  EloquentBuilder<*>|Builder  $query
     */
    public function apply(EloquentBuilder|Builder $query, string $column): void
    {
        $query->where($column, '>=', StaleRuns::format($this->from))
            ->where($column, '<', StaleRuns::format($this->to));
    }

    /**
     * @return array{preset: ?string, from: string, to: string}
     */
    public function toArray(): array
    {
        return [
            'preset' => $this->preset,
            'from' => (string) Timestamp::format($this->from),
            'to' => (string) Timestamp::format($this->to),
        ];
    }

    private static function parameter(Request $request, string $name): mixed
    {
        $value = $request->query($name);

        return $value === '' ? null : $value;
    }

    private static function moment(string $name, mixed $value): CarbonImmutable
    {
        $timezone = config('app.timezone');

        try {
            // Carbon alone reads some garbage as a date (99999-01-01 becomes 2009), so the shape is checked first.
            if (! is_string($value) || preg_match('/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?\z/i', $value) !== 1) {
                throw new \InvalidArgumentException;
            }

            $moment = CarbonImmutable::parse($value, is_string($timezone) ? $timezone : 'UTC');

            // A day that does not exist rolls over when parsed (30 February becomes 2 March), and a
            // datetime column holds no year before 1000.
            if (! str_starts_with($value, $moment->format('Y-m-d')) || $moment->year < 1000) {
                throw new \InvalidArgumentException;
            }
        } catch (Throwable) {
            throw ValidationException::withMessages([$name => "The {$name} must be an ISO 8601 date-time."]);
        }

        return $moment;
    }
}
