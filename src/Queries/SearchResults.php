<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Storage\Models\Trace;

/**
 * What a search found, a group at a time, and whether a group had more than it holds.
 */
final readonly class SearchResults
{
    /**
     * @param  list<Trace>  $traces
     * @param  list<ConversationSummary>  $conversations
     * @param  list<Agent>  $agents
     */
    public function __construct(
        public array $traces,
        public bool $tracesTruncated,
        public array $conversations,
        public bool $conversationsTruncated,
        public array $agents,
        public bool $agentsTruncated,
    ) {}

    public static function none(): self
    {
        return new self([], false, [], false, [], false);
    }
}
