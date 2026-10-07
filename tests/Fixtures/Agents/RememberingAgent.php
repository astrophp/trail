<?php

namespace Astro\Trail\Tests\Fixtures\Agents;

use Laravel\Ai\Concerns\RemembersConversations;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\Conversational;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\Promptable;
use Stringable;

/**
 * An agent that stores its conversations in the SDK's own tables.
 */
class RememberingAgent implements Agent, Conversational, HasTools
{
    use Promptable, RemembersConversations;

    /**
     * @param  array<int, mixed>  $tools
     */
    public function __construct(protected array $tools = []) {}

    public function instructions(): Stringable|string
    {
        return 'You remember conversations.';
    }

    public function tools(): iterable
    {
        return $this->tools;
    }
}
