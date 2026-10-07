<?php

namespace Astro\Trail\Tests\Fixtures\Conversations;

/**
 * A plain object that can own a conversation: the SDK only needs an [id] property.
 */
class ConversationParticipant
{
    public function __construct(public int $id = 42, public string $name = 'Ada') {}
}
