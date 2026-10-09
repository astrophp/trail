<?php

namespace Astro\Trail\Queries;

/**
 * The buckets of a range as the overview cuts them, and a projection of the period after them.
 */
final readonly class Spend
{
    /**
     * @param  list<OverviewBucket>  $buckets
     */
    public function __construct(
        public BucketUnit $unit,
        public array $buckets,
        public SpendProjection $projection,
    ) {}
}
