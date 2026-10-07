<?php

namespace Astro\Trail\Tests\Fixtures\Capture\Hardening;

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Stringable;

/**
 * An agent whose application methods can be made to do anything, and which counts how often it is
 * asked. Trail and the SDK both call into user code; a test compares how often with and without Trail.
 */
class ProbeAgent extends AssistantAgent
{
    public static string $instructions = 'count';

    public static int $instructionsCalls = 0;

    public static int $participantCalls = 0;

    public static int $conversationCalls = 0;

    public static function reset(string $instructions = 'count'): void
    {
        self::$instructions = $instructions;
        self::$instructionsCalls = self::$participantCalls = self::$conversationCalls = 0;
    }

    public function instructions(): Stringable|string
    {
        self::$instructionsCalls++;

        return match (self::$instructions) {
            'throws' => throw new RuntimeException('instructions() failed'),
            'queries' => 'Instructions read from '.DB::table('trail_prices')->count().' rows.',
            'slow' => (function () {
                usleep(80_000);

                return 'Slow instructions.';
            })(),
            'stringable that throws' => new class implements Stringable
            {
                public function __toString(): string
                {
                    throw new RuntimeException('cannot be a string');
                }
            },
            default => 'Counted instructions.',
        };
    }

    /** Not called by the SDK for this agent: it does not remember conversations. */
    public function conversationParticipant(): ?object
    {
        self::$participantCalls++;
        DB::table('trail_prices')->count();

        return null;
    }

    public function currentConversation(): ?string
    {
        self::$conversationCalls++;

        return null;
    }
}
