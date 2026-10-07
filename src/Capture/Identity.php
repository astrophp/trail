<?php

namespace Astro\Trail\Capture;

use Laravel\Ai\Concerns\RemembersConversations;
use Laravel\Ai\Contracts\RemembersConversations as RemembersConversationsContract;
use Laravel\Ai\Models\Conversation;
use Throwable;

/**
 * Who an agent run belongs to: its conversation and the user in it. The agent exposes both only
 * when it uses the SDK's conversation trait, through methods an application can override, so
 * every read is guarded and a failure means "unknown".
 */
final class Identity
{
    public function __construct(
        public readonly ?string $conversationId = null,
        public readonly ?string $userId = null,
        public readonly ?string $userType = null,
    ) {}

    /** @var array<class-string, bool> */
    private static array $remembers = [];

    public static function of(object $agent): self
    {
        // The SDK asks for these only of an agent that implements its contract or uses its trait, so Trail does too.
        if (! self::remembers($agent)) {
            return new self;
        }

        return self::from(self::conversationOf($agent), self::participantOf($agent));
    }

    private static function remembers(object $agent): bool
    {
        return self::$remembers[$agent::class] ??= $agent instanceof RemembersConversationsContract
            || in_array(RemembersConversations::class, class_uses_recursive($agent), true);
    }

    /**
     * The identity a terminal response reports.
     */
    public static function ofResponse(object $response): self
    {
        $conversation = $response->conversationId ?? null;
        $user = $response->conversationUser ?? null;

        return self::from(is_string($conversation) ? $conversation : null, is_object($user) ? $user : null);
    }

    private static function from(?string $conversationId, ?object $participant): self
    {
        $userId = null;
        $userType = null;

        if ($participant !== null) {
            try {
                // The SDK's own derivation, so the values match its stored conversation rows.
                $userType = Conversation::participantType($participant);
                $userId = (string) Conversation::participantKey($participant);
            } catch (Throwable) {
                $userId = null;
                $userType = null;
            }
        }

        return new self($conversationId === '' ? null : $conversationId, $userId, $userType);
    }

    private static function conversationOf(object $agent): ?string
    {
        if (! is_callable([$agent, 'currentConversation'])) {
            return null;
        }

        try {
            $conversation = $agent->currentConversation();

            return is_string($conversation) ? $conversation : null;
        } catch (Throwable) {
            return null;
        }
    }

    private static function participantOf(object $agent): ?object
    {
        if (! is_callable([$agent, 'conversationParticipant'])) {
            return null;
        }

        try {
            $participant = $agent->conversationParticipant();

            return is_object($participant) ? $participant : null;
        } catch (Throwable) {
            return null;
        }
    }
}
