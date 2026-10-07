<?php

namespace Astro\Trail\Capture;

use Laravel\Ai\Models\Conversation;
use Throwable;

/**
 * Who an agent run belongs to: its conversation and the user in it. The agent exposes both only
 * when it uses the SDK's conversation trait, through methods an application can override, so
 * every read is guarded and a failure means "unknown".
 */
final readonly class Identity
{
    public function __construct(
        public ?string $conversationId = null,
        public ?string $userId = null,
        public ?string $userType = null,
    ) {}

    public static function of(object $agent): self
    {
        return self::from(self::conversationOf($agent), self::participantOf($agent));
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
