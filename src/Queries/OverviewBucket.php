<?php

namespace Astro\Trail\Queries;

use Carbon\CarbonImmutable;

/**
 * One slice of the series: the part of a clock bucket inside the range, and what its runs add up to.
 */
final readonly class OverviewBucket
{
    /**
     * @param  CarbonImmutable  $from  included
     * @param  CarbonImmutable  $to  excluded
     * @param  bool  $full  whether the clock bucket lies wholly inside the range
     * @param  bool  $inProgress  whether the clock bucket has not ended yet
     */
    public function __construct(
        public CarbonImmutable $from,
        public CarbonImmutable $to,
        public bool $full,
        public bool $inProgress,
        public RunFigures $figures,
    ) {}
}
