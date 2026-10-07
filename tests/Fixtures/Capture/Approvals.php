<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

use Astro\Trail\Tests\Fixtures\Agents\RememberingAgent;
use Astro\Trail\Tests\Fixtures\Conversations\ConversationParticipant;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;

/**
 * Builders for runs that pause for approval and the runs that resume them.
 */
final class Approvals
{
    /**
     * One scripted turn asking for the approval-gated tool.
     *
     * @return array<string, mixed>
     */
    public static function turn(string $id = 'toolu_1', string $table = 'users'): array
    {
        return FakeAnthropic::toolUse([['id' => $id, 'name' => 'delete_records', 'input' => ['table' => $table]]]);
    }

    /**
     * An agent that remembers its conversation, which is what lets a pause be resumed.
     *
     * @param  array<int, mixed>  $tools
     */
    public static function agent(array $tools, ConversationParticipant $user, ?string $conversationId = null): RememberingAgent
    {
        $agent = new RememberingAgent($tools);

        return $conversationId === null ? $agent->forUser($user) : $agent->continue($conversationId, as: $user);
    }
}
