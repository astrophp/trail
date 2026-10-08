<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Queries\Overview;
use Astro\Trail\Queries\OverviewBucket;

/**
 * The overview as the API sends it: the summary, the previous period's (or null) and the series.
 */
final class OverviewResource
{
    /**
     * @return array<string, mixed>
     */
    public static function of(Overview $overview): array
    {
        return [
            'summary' => SummaryResource::of($overview->summary),
            'previous' => $overview->previous === null ? null : SummaryResource::of($overview->previous),
            'series' => [
                'bucket' => $overview->unit->value,
                'buckets' => array_map(self::bucket(...), $overview->buckets),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function bucket(OverviewBucket $bucket): array
    {
        $figures = $bucket->figures;

        return [
            'from' => Timestamp::format($bucket->from),
            'to' => Timestamp::format($bucket->to),
            'full' => $bucket->full,
            'in_progress' => $bucket->inProgress,
            'runs' => $figures->runs,
            'duration' => ['average_ms' => SummaryResource::average($figures), 'measured' => $figures->measured],
            'cost' => SummaryResource::cost($figures, $figures->runs['running'] > 0),
            'unpriced_runs' => $figures->unpricedRuns,
        ];
    }
}
