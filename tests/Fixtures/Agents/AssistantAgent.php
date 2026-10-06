<?php

namespace Astro\Trail\Tests\Fixtures\Agents;

use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\Promptable;
use Stringable;

/**
 * A plain agent whose tools are handed in by the test.
 */
class AssistantAgent implements Agent, HasTools
{
    use Promptable;

    /**
     * @param  array<int, mixed>  $tools
     */
    public function __construct(protected array $tools = []) {}

    public function instructions(): Stringable|string
    {
        return 'You are a test assistant.';
    }

    public function tools(): iterable
    {
        return $this->tools;
    }
}
