<?php

namespace Astro\Trail\Queries;

use Carbon\CarbonImmutable;

/**
 * A page of agents, how many there are in all, and the buckets their activity is counted over.
 */
final readonly class AgentListing
{
    /**
     * @param  list<Agent>  $agents  the page
     * @param  int  $total  the agents read, not only the page
     * @param  bool  $truncated  whether more agents than the limit were found and the rest not read
     * @param  list<array{from: CarbonImmutable, to: CarbonImmutable, full: bool, inProgress: bool}>  $buckets
     */
    public function __construct(
        public array $agents,
        public int $total,
        public bool $truncated,
        public int $limit,
        public BucketUnit $unit,
        public array $buckets,
    ) {}
}
