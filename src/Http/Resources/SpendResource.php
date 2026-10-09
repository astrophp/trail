<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Queries\ProjectionState;
use Astro\Trail\Queries\RunFigures;
use Astro\Trail\Queries\Spend;
use Astro\Trail\Queries\SpendProjection;

/**
 * The estimated cost recorded in each bucket, running up as the range goes on, and beside it a
 * projection that is never summed into it: its `cumulative` only says where a chart continues.
 */
final class SpendResource
{
    /**
     * @return array<string, mixed>
     */
    public static function of(Spend $spend): array
    {
        $buckets = [];
        $soFar = RunFigures::empty();
        $cumulative = ['state' => 'not_captured', 'amount' => null];

        foreach ($spend->buckets as $bucket) {
            // The figures of the buckets so far, summed as the overview sums its buckets into the summary.
            $soFar = RunFigures::sum([$soFar, $bucket->figures]);
            $cumulative = SummaryResource::cost($soFar, $soFar->runs['running'] > 0);

            $buckets[] = [...OverviewResource::bucket($bucket), 'cumulative' => $cumulative];
        }

        return [
            'series' => ['bucket' => $spend->unit->value, 'buckets' => $buckets],
            'projection' => self::projection($spend->projection, $cumulative['amount']),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function projection(SpendProjection $projection, ?float $recorded): array
    {
        $window = $projection->window;
        $perBucket = $projection->perBucket;
        $projected = $projection->state === ProjectionState::Projected && $perBucket !== null;
        $ahead = [];

        foreach ($projection->ahead as $position => $bucket) {
            $ahead[] = [
                'from' => Timestamp::format($bucket['from']),
                'to' => Timestamp::format($bucket['to']),
                'amount' => $perBucket,
                'cumulative' => round(($recorded ?? 0.0) + ($perBucket ?? 0.0) * ($position + 1), RunFigures::PLACES),
            ];
        }

        return [
            'state' => $projection->state->value,
            'window' => $window === null ? null : [
                'from' => Timestamp::format($window->from),
                'to' => Timestamp::format($window->to),
                'buckets' => $window->buckets,
                'with_usage' => $window->withUsage,
            ],
            'per_bucket' => $perBucket,
            'total' => $projected ? round($perBucket * count($projection->ahead), RunFigures::PLACES) : null,
            'buckets' => $ahead,
            'left_out' => [
                'unpriced_steps' => $projection->unpricedSteps,
                'unpriced_tokens' => $projection->unpricedTokens,
                'unfinished_runs' => $projection->unfinishedRuns,
            ],
        ];
    }
}
