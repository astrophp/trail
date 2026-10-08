<?php

namespace Astro\Trail\Queries;

use DateTimeImmutable;

/**
 * One kind of run that needs a look: how many runs of the range are of it, when the latest one
 * started (null when that time could not be read), and the parameters of the runs list that show them. Only `failed` has a breakdown.
 */
final readonly class AttentionItem
{
    /**
     * @param  array<string, string>  $filters
     * @param  list<AttentionRow>  $breakdown
     */
    public function __construct(
        public AttentionKind $kind,
        public int $count,
        public ?DateTimeImmutable $latestAt,
        public array $filters,
        public array $breakdown = [],
    ) {}
}
