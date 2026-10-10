<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Queries\OverviewQuery;
use Astro\Trail\Queries\OverviewSummary;
use Astro\Trail\Queries\RunFigures;

/**
 * The summary of a set of runs as the API sends it: the same shape for a range, for the period
 * before it and, later, for one agent.
 */
final class SummaryResource
{
    /**
     * @return array<string, mixed>
     */
    public static function of(OverviewSummary $summary): array
    {
        $figures = $summary->figures;
        $runs = $figures->runs;
        $running = $runs['running'] > 0;

        return [
            'runs' => $runs,
            'error_rate' => self::errorRate($figures),
            'duration' => [
                'average_ms' => self::average($figures),
                'p95_ms' => $summary->p95Ms,
                'measured' => $figures->measured,
                'not_measured' => $runs['all'] - $figures->measured,
                'p95_minimum' => OverviewQuery::P95_MINIMUM,
            ],
            'usage' => self::usage($figures),
            'usage_coverage' => [
                'reported' => $figures->reported,
                'not_reported' => $runs['all'] - $figures->reported,
            ],
            'cost' => self::cost($figures, $running),
            'cost_coverage' => [
                'unpriced_runs' => $figures->unpricedRuns,
                'runs_without_amount' => $figures->withoutAmount,
            ],
        ];
    }

    /**
     * @return array{rate: ?float, failed: int, finished: int}
     */
    public static function errorRate(RunFigures $figures): array
    {
        return ['rate' => $figures->errorRate(), 'failed' => $figures->runs['failed'], 'finished' => $figures->finished()];
    }

    /**
     * @return array<string, mixed>
     */
    public static function usage(RunFigures $figures): array
    {
        $tokens = $figures->tokens;

        return Usage::of($figures->runs['running'] > 0, $tokens['input'], $tokens['output'], $tokens['cache_read'], $tokens['cache_write'], $tokens['reasoning']);
    }

    /**
     * The mean duration of the runs that have one, rounded to 3 decimals.
     */
    public static function average(RunFigures $figures): ?float
    {
        return $figures->meanDuration();
    }

    /**
     * @return array{state: string, amount: ?float}
     */
    public static function cost(RunFigures $figures, bool $running): array
    {
        return Cost::of($figures->costAmount(), $figures->unpricedSpans, $running);
    }
}
