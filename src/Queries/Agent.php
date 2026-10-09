<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\SpanType;
use DateTimeImmutable;

/**
 * An agent in a range: a name under which a run started, or under which an agent span with a
 * parent started in a run that did. Its own runs ("top level") and the times it was delegated to
 * are kept apart.
 */
final readonly class Agent
{
    /**
     * @param  ?RunFigures  $topLevel  null when the agent has no run of its own in the range
     * @param  ?DateTimeImmutable  $lastRunAt  when the latest of those runs started
     * @param  ?Delegations  $delegated  null when it was not delegated to in the range
     * @param  list<int>  $activity  the runs of its own that started in each bucket of the range
     */
    public function __construct(
        public string $name,
        public ?string $agentClass,
        public SpanType $type,
        public ?RunFigures $topLevel,
        public ?DateTimeImmutable $lastRunAt,
        public ?Delegations $delegated,
        public array $activity,
    ) {}

    /**
     * The later of the latest run and the latest delegated span; null when it has neither in the range.
     */
    public function lastActivityAt(): ?DateTimeImmutable
    {
        $moments = array_values(array_filter([$this->lastRunAt, $this->delegated?->lastAt]));

        return $moments === [] ? null : max($moments);
    }

    /**
     * An agent that was recorded, but not in this range: nothing of its own and nothing delegated.
     *
     * @param  int  $buckets  how many buckets the range has
     */
    public static function quiet(AgentIdentity $identity, int $buckets): self
    {
        return new self($identity->name, $identity->agentClass, $identity->type, null, null, null, array_fill(0, $buckets, 0));
    }
}
