<?php

namespace Astro\Trail\Queries;

/**
 * The figures of a set of runs and their 95th percentile duration, which is null when it was not
 * worth computing: fewer than the minimum had a duration.
 */
final readonly class OverviewSummary
{
    public function __construct(public RunFigures $figures, public ?float $p95Ms) {}
}
