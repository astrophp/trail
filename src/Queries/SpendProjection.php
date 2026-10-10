<?php

namespace Astro\Trail\Queries;

use Carbon\CarbonImmutable;

/**
 * A simple projection of the next period, beside the recorded series and never part of it: the
 * estimated cost per bucket of the recent complete buckets at today's prices, carried forward.
 */
final readonly class SpendProjection
{
    /**
     * @param  ?SpendWindow  $window  null when the range is not current, or has no complete bucket
     * @param  ?float  $perBucket  null unless projected
     * @param  list<array{from: CarbonImmutable, to: CarbonImmutable}>  $ahead  the buckets that follow the series; empty unless projected
     * @param  int  $unpricedSteps  steps in the window that reported usage and have no usable rate now
     * @param  ?int  $unpricedTokens  their input and output tokens; null when they reported neither
     * @param  int  $unfinishedRuns  runs in the window still running
     */
    public function __construct(
        public ProjectionState $state,
        public ?SpendWindow $window,
        public ?float $perBucket,
        public array $ahead,
        public int $unpricedSteps,
        public ?int $unpricedTokens,
        public int $unfinishedRuns,
    ) {}

    /**
     * An explicit range is never projected, whatever its end.
     */
    public static function notCurrent(): self
    {
        return new self(ProjectionState::RangeNotCurrent, null, null, [], 0, 0, 0);
    }
}
