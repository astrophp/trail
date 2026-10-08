<?php

namespace Astro\Trail\Queries;

/**
 * The summary of a range, of the period just before it, and the range cut into buckets.
 */
final readonly class Overview
{
    /**
     * @param  ?OverviewSummary  $previous  null when the previous period holds no runs
     * @param  list<OverviewBucket>  $buckets
     */
    public function __construct(
        public OverviewSummary $summary,
        public ?OverviewSummary $previous,
        public TimeRange $previousRange,
        public BucketUnit $unit,
        public array $buckets,
    ) {}
}
