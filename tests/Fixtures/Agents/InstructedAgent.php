<?php

namespace Astro\Trail\Tests\Fixtures\Agents;

use Stringable;

/**
 * An agent whose instructions are set by the test, and which counts how often they are read.
 */
class InstructedAgent extends AssistantAgent
{
    public static int $reads = 0;

    public static string $text = 'You are a test assistant.';

    public function instructions(): Stringable|string
    {
        self::$reads++;

        return self::$text;
    }
}
