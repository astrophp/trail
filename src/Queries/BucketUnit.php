<?php

namespace Astro\Trail\Queries;

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

    /** The longest explicit range that is cut, in days; a series then holds at most 93 buckets. */
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
     * @return list<array{from: CarbonImmutable, to: CarbonImmutable, end: CarbonImmutable, full: bool}> `end` is where the clock bucket ends, uncut
     */
    public function buckets(TimeRange $range): array
    {
        $timezone = config('app.timezone');
        $timezone = is_string($timezone) ? $timezone : 'UTC';
        $from = $range->from->setTimezone($timezone);
        $to = $range->to->setTimezone($timezone);

        $buckets = [];

        for ($edge = $this->floor($from); $edge < $to; $edge = $end) {
            $end = $this->next($edge);

            $buckets[] = [
                'from' => $edge < $from ? $from : $edge,
                'to' => $end > $to ? $to : $end,
                'end' => $end,
                'full' => $edge >= $from && $end <= $to,
            ];
        }

        return $buckets;
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
