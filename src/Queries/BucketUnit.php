<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Storage\StaleRuns;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

/**
 * How finely a range is cut for a series: along the clock of the application's timezone, at
 * multiples of five minutes, at whole hours or at midnights.
 */
enum BucketUnit: string
{
    case FiveMinutes = '5m';
    case Hour = 'hour';
    case Day = 'day';

    /**
     * The longest explicit range that is cut, in days. It reaches at most 94 calendar days, since
     * a day on which the clock goes forward is 23 hours long: 92 times 24 hours that starts late on
     * the day before such a day touches 94 days. A range of up to 2 hours reaches at most 25 buckets
     * and one of up to 48 hours at most 49.
     */
    public const MAXIMUM_DAYS = 92;

    private const HOUR_MS = 3600000;

    /**
     * The preset's own unit; for an explicit range the finest unit that keeps the series short.
     *
     * @throws ValidationException when the range is longer than the series can show
     */
    public static function for(TimeRange $range): self
    {
        if ($range->preset !== null) {
            return match ($range->preset) {
                '1h' => self::FiveMinutes,
                '24h' => self::Hour,
                default => self::Day,
            };
        }

        $milliseconds = $range->to->getTimestampMs() - $range->from->getTimestampMs();

        return match (true) {
            $milliseconds <= 2 * self::HOUR_MS => self::FiveMinutes,
            $milliseconds <= 48 * self::HOUR_MS => self::Hour,
            $milliseconds <= self::MAXIMUM_DAYS * 24 * self::HOUR_MS => self::Day,
            default => throw ValidationException::withMessages(['from' => 'The range is too long: at most '.self::MAXIMUM_DAYS.' days.']),
        };
    }

    /**
     * The clock buckets the range touches, in order. Each is cut to the range: it starts no earlier
     * than the range and ends no later. A range that ends exactly on an edge has no bucket after it.
     *
     * The application stores local times, so in the hour a clock is set back two instants share one
     * stored time and no bucket inside that hour could tell its runs apart. That whole stretch is
     * one bucket, longer than the unit.
     *
     * @return list<array{start: CarbonImmutable, end: CarbonImmutable, from: CarbonImmutable, to: CarbonImmutable, full: bool}> `start` and `end` are those of the clock bucket, uncut
     */
    public function buckets(TimeRange $range): array
    {
        $timezone = config('app.timezone');
        $timezone = is_string($timezone) ? $timezone : 'UTC';
        $from = $range->from->setTimezone($timezone);
        $to = $range->to->setTimezone($timezone);

        // Where each bucket starts, and at the end where the last one ends.
        $edges = [];

        for ($edge = $this->floor($from); $edge < $to; $edge = $this->next($edge)) {
            $edges[] = $edge;
        }

        $edges[] = $edge;

        $merged = self::repeatedStretches($edges);
        $buckets = [];

        for ($first = 0; $first < count($edges) - 1; $first = $last + 1) {
            $last = min($merged[$first] ?? $first, count($edges) - 2);
            $start = $edges[$first];
            $end = $edges[$last + 1];

            $buckets[] = [
                'start' => $start,
                'end' => $end,
                'from' => $start < $from ? $from : $start,
                'to' => $end > $to ? $to : $end,
                'full' => $start >= $from && $end <= $to,
            ];
        }

        return $buckets;
    }

    /**
     * Where the stored times of the edges, as the database compares them, do not keep increasing:
     * the edges from the first whose stored time is not below the one after the step back, through
     * the last whose stored time is not above the one before it, belong to one bucket.
     *
     * @param  list<CarbonImmutable>  $edges
     * @return array<int, int> the first edge of each such stretch => the last edge that starts a piece of it
     */
    private static function repeatedStretches(array $edges): array
    {
        $stored = array_map(StaleRuns::format(...), $edges);
        $stretches = [];

        foreach ($stored as $index => $before) {
            $after = $stored[$index + 1] ?? null;

            if ($after === null || $after > $before) {
                continue;
            }

            $first = $index + 1;

            while ($first > 0 && $stored[$first - 1] >= $after) {
                $first--;
            }

            $last = $index;

            while (isset($stored[$last + 1]) && $stored[$last + 1] <= $before) {
                $last++;
            }

            $stretches[$first] = max($stretches[$first] ?? 0, $last);
        }

        return $stretches;
    }

    private function floor(CarbonImmutable $moment): CarbonImmutable
    {
        return match ($this) {
            self::FiveMinutes => $moment->setTime((int) $moment->format('H'), intdiv((int) $moment->format('i'), 5) * 5),
            self::Hour => $moment->startOfHour(),
            self::Day => $moment->startOfDay(),
        };
    }

    /**
     * Minutes and hours are elapsed time; a day is a calendar day, which a clock change makes 23 or 25 hours long.
     */
    private function next(CarbonImmutable $edge): CarbonImmutable
    {
        $next = match ($this) {
            self::FiveMinutes => $edge->addMinutes(5),
            self::Hour => $edge->addHour(),
            self::Day => $edge->addDay()->startOfDay(),
        };

        return $next > $edge ? $next : $edge->addHour();
    }
}
