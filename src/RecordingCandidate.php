<?php

namespace Astro\Trail;

use Astro\Trail\Enums\SpanType;
use Laravel\Ai\Contracts\Agent;

/**
 * A top-level run that is about to start, as the filter given to Trail::filter() sees it.
 *
 * The prompt is the application's own text exactly as it was given, before any redaction. Trail
 * redacts what it stores; what a filter is shown is not stored.
 */
final readonly class RecordingCandidate
{
    public function __construct(
        /** SpanType::Agent for an agent run, SpanType::Embedding for an embeddings call made on its own. */
        public SpanType $type,
        /** The agent's class, or null for an anonymous agent and for embeddings. */
        public ?string $agentClass,
        /** The agent instance, or null for embeddings. */
        public ?Agent $agent,
        /** The prompt text, or null for embeddings. */
        public ?string $prompt,
        /** The user of the conversation, when the agent remembers conversations and has one. */
        public ?string $userId,
        public ?string $userType,
        /** The provider's driver name, not the name of its connection. */
        public ?string $provider,
        public ?string $model,
    ) {}
}
