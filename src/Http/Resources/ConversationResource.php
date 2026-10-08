<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Queries\ConversationSummary;

/**
 * A conversation as every endpoint returns it. Built for a set of conversations, so the users of
 * the whole set cost one lookup however many it holds; a single conversation is a set of one.
 */
final readonly class ConversationResource
{
    public function __construct(private ResolvedUsers $users) {}

    /**
     * @param  iterable<ConversationSummary>  $summaries
     */
    public static function of(iterable $summaries): self
    {
        $pairs = [];

        foreach ($summaries as $summary) {
            foreach ($summary->users as $user) {
                $pairs[] = [$user['type'], $user['id']];
            }
        }

        return new self(ResolvedUsers::of($pairs));
    }

    /**
     * @param  iterable<ConversationSummary>  $summaries
     * @return list<array<string, mixed>>
     */
    public function collection(iterable $summaries): array
    {
        $items = [];

        foreach ($summaries as $summary) {
            $items[] = $this->toArray($summary);
        }

        return $items;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(ConversationSummary $conversation): array
    {
        // A turn still running (by the stale rule) makes what the others add up to a figure so far.
        $running = $conversation->turns['running'] > 0;

        return [
            'id' => $conversation->id,
            'turns' => $conversation->turns,
            'agents' => $conversation->agents,
            'agent_count' => $conversation->agentCount,
            'users' => array_values(array_filter(array_map(
                fn (array $user) => $this->users->get($user['type'], $user['id']),
                $conversation->users,
            ))),
            'user_count' => $conversation->userCount,
            'usage' => Usage::of(
                $running,
                $conversation->inputTokens,
                $conversation->outputTokens,
                $conversation->cacheReadTokens,
                $conversation->cacheWriteTokens,
                $conversation->reasoningTokens,
            ),
            'cost' => Cost::of($conversation->cost === null ? null : (float) $conversation->cost, $conversation->unpricedSpanCount, $running),
            'prompt_excerpt' => $conversation->promptExcerpt,
            'first_activity_at' => Timestamp::format($conversation->firstActivityAt),
            'last_activity_at' => Timestamp::format($conversation->lastActivityAt),
        ];
    }
}
