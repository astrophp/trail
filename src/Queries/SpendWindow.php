<?php

namespace Astro\Trail\Queries;

use Carbon\CarbonImmutable;

/**
 * The complete buckets a projection's rate was taken from.
 */
final readonly class SpendWindow
{
    /**
     * @param  CarbonImmutable  $from  the start of the oldest bucket
     * @param  CarbonImmutable  $to  the end of the newest bucket
     * @param  int  $buckets  how many buckets the window holds
     * @param  int  $withUsage  how many of them have a step that reported usage
     */
    public function __construct(
        public CarbonImmutable $from,
        public CarbonImmutable $to,
        public int $buckets,
        public int $withUsage,
    ) {}
}
