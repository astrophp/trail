<?php

namespace Astro\Trail\Tests\Fixtures\Agents;

use Laravel\Ai\Contracts\RemembersConversations;

/**
 * An agent that remembers conversations by implementing the SDK's contract itself, without using
 * its trait, which the SDK counts as remembering all the same.
 */
class ContractOnlyAgent extends AssistantAgent implements RemembersConversations
{
    public function __construct(private ?object $user = null, private ?string $conversation = null)
    {
        parent::__construct();
    }

    public function forParticipant(object $participant): static
    {
        $this->user = $participant;

        return $this;
    }

    public function forUser(object $user): static
    {
        return $this->forParticipant($user);
    }

    public function continue(string $conversationId, ?object $as = null): static
    {
        $this->conversation = $conversationId;
        $this->user = $as;

        return $this;
    }

    public function continueOrStart(?string $conversationId, object $as): static
    {
        return $conversationId === null ? $this->forParticipant($as) : $this->continue($conversationId, $as);
    }

    public function continueLastConversation(object $as): static
    {
        return $this->forParticipant($as);
    }

    public function messages(): iterable
    {
        return [];
    }

    public function currentConversation(): ?string
    {
        return $this->conversation;
    }

    public function hasConversationParticipant(): bool
    {
        return $this->user !== null;
    }

    public function conversationParticipant(): ?object
    {
        return $this->user;
    }
}
