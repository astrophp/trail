<?php

namespace Astro\Trail\Tests\Fixtures\Agents;

use RuntimeException;

/**
 * An agent whose participant method is application code that fails. The SDK never calls it
 * because this agent does not remember conversations. It has no conversation method, which is
 * also what keeps the test event log, which reads both together, from calling it.
 */
class BrokenParticipantAgent extends AssistantAgent
{
    public function conversationParticipant(): ?object
    {
        throw new RuntimeException('No participant.');
    }
}
