<?php

namespace Astro\Trail\Tests\Fixtures\Agents;

/**
 * A remembering agent that counts how often its participant is asked for, which is application
 * code that could do anything.
 */
class CountingParticipantAgent extends RememberingAgent
{
    public static int $asked = 0;

    public function conversationParticipant(): ?object
    {
        self::$asked++;

        return parent::conversationParticipant();
    }
}
