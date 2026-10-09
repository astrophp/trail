<?php

namespace Astro\Trail\Queries;

/**
 * A page of the usage breakdown, and how many rows there are to page through.
 */
final readonly class UsageListing
{
    /**
     * @param  list<UsageGroup>  $groups  the rows of the page
     * @param  int  $total  the rows read, which is all of them unless the read was truncated
     * @param  bool  $truncated  whether there were more rows than the limit
     */
    public function __construct(
        public string $by,
        public array $groups,
        public int $total,
        public bool $truncated,
        public int $limit,
    ) {}
}
