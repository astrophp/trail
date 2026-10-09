<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\SpanType;

/**
 * How an agent is written: the spelling, class and type of its latest run, or of its latest
 * delegated span when it has no run of its own.
 */
final readonly class AgentIdentity
{
    public function __construct(public string $name, public ?string $agentClass, public SpanType $type) {}
}
