<?php

namespace Astro\Trail\Queries;

use DateTimeImmutable;

/**
 * What the database says about one conversation, over all of its turns: the figures as stored sums
 * and counts, not yet in the shape the API sends.
 */
final readonly class ConversationSummary
{
    /**
     * @param  array{all: int, completed: int, failed: int, incomplete: int, running: int, awaiting_approval: int}  $turns
     * @param  list<string>  $agents  the first names by name, capped
     * @param  int  $agentCount  how many distinct names there are, whatever the cap
     * @param  list<array{type: string, id: string}>  $users  the first users, capped
     * @param  int  $userCount  how many distinct users there are, whatever the cap
     * @param  int|float|string|null  $cost  the sum of the turns' cost, as the database returns it
     */
    public function __construct(
        public string $id,
        public array $turns,
        public array $agents,
        public int $agentCount,
        public array $users,
        public int $userCount,
        public ?int $inputTokens,
        public ?int $outputTokens,
        public ?int $cacheReadTokens,
        public ?int $cacheWriteTokens,
        public ?int $reasoningTokens,
        public int|float|string|null $cost,
        public int $unpricedSpanCount,
        public ?string $promptExcerpt,
        public DateTimeImmutable $firstActivityAt,
        public DateTimeImmutable $lastActivityAt,
    ) {}
}
