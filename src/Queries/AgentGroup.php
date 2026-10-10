<?php

namespace Astro\Trail\Queries;

use DateTimeImmutable;

/**
 * One agent as the grouped reads found it, before its spelling, class and activity are read: what
 * its own runs add up to, and the times it was delegated to. Names are grouped as the database
 * compares text, so `name` is one spelling of the group, not necessarily the latest.
 */
final readonly class AgentGroup
{
    public function __construct(
        public string $name,
        public ?RunFigures $figures,
        public ?DateTimeImmutable $lastRunAt,
        public ?Delegations $delegated,
    ) {}

    public function withDelegations(Delegations $delegated): self
    {
        return new self($this->name, $this->figures, $this->lastRunAt, $delegated);
    }

    /**
     * The later of the latest run and the latest delegated span.
     */
    public function lastActivityAt(): ?DateTimeImmutable
    {
        $moments = array_values(array_filter([$this->lastRunAt, $this->delegated?->lastAt]));

        return $moments === [] ? null : max($moments);
    }

    /**
     * The value a sort orders by, null when the group has none: a delegated-only agent has no run
     * of its own to count, and an agent with no finished run has no error rate.
     */
    public function sortValue(string $sort): int|float|string|null
    {
        return match ($sort) {
            'runs' => $this->figures?->runs['all'],
            'name' => $this->name,
            'error_rate' => $this->figures?->errorRate(),
            'duration' => $this->figures?->meanDuration(),
            'cost' => $this->figures?->costAmount(),
            default => ($moment = $this->lastActivityAt()) === null ? null : (int) $moment->format('Uv'),
        };
    }
}
