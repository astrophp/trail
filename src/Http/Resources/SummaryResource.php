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
    /** Decimal places of an error rate and of a money amount. */
    private const PLACES = 10;

    /**
     * @return array<string, mixed>
     */
    public static function of(OverviewSummary $summary): array
    {
        $figures = $summary->figures;
        $runs = $figures->runs;
        $running = $runs['running'] > 0;
        $tokens = $figures->tokens;

        $finished = $runs['completed'] + $runs['failed'] + $runs['incomplete'];

        return [
            'runs' => $runs,
            'error_rate' => [
                'rate' => $finished === 0 ? null : round($runs['failed'] / $finished, self::PLACES),
                'failed' => $runs['failed'],
                'finished' => $finished,
            ],
            'duration' => [
                'average_ms' => self::average($figures),
                'p95_ms' => $summary->p95Ms,
                'measured' => $figures->measured,
                'not_measured' => $runs['all'] - $figures->measured,
                'p95_minimum' => OverviewQuery::P95_MINIMUM,
            ],
            'usage' => Usage::of($running, $tokens['input'], $tokens['output'], $tokens['cache_read'], $tokens['cache_write'], $tokens['reasoning']),
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
     * The mean duration of the runs that have one, rounded to 3 decimals.
     */
    public static function average(RunFigures $figures): ?float
    {
        return $figures->measured === 0 || $figures->durationSum === null ? null : round($figures->durationSum / $figures->measured, 3);
    }

    /**
     * @return array{state: string, amount: ?float}
     */
    public static function cost(RunFigures $figures, bool $running): array
    {
        return Cost::of($figures->costSum === null ? null : round($figures->costSum, self::PLACES), $figures->unpricedSpans, $running);
    }
}
