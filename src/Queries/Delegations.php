<?php

namespace Astro\Trail\Queries;

use DateTimeImmutable;

/**
 * The times an agent was delegated to in a range: its agent spans that have a parent. A delegated
 * run is a span of the run that delegated, so it has no usage, cost or whole-run status of its own,
 * and none is made up here.
 */
final readonly class Delegations
{
    /**
     * @param  int  $all  the agent spans
     * @param  int  $failed  those whose span shows failed
     * @param  int  $incomplete  those whose span shows incomplete: stored so, or still open past the cutoff
     * @param  ?DateTimeImmutable  $lastAt  when the latest started
     */
    public function __construct(public int $all, public int $failed, public int $incomplete, public ?DateTimeImmutable $lastAt) {}
}
