<?php

namespace Astro\Trail\Tests\Fixtures\Capture\Queue;

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use RuntimeException;

/**
 * A queued job that prompts an agent and then succeeds, fails for good or fails and is retried.
 */
class AgentJob implements ShouldQueue
{
    use Dispatchable;
    use Queueable;

    public int $tries;

    public function __construct(public string $mode = 'succeed')
    {
        $this->tries = $mode === 'retry' ? 3 : 1;
    }

    public function handle(): void
    {
        (new AssistantAgent)->prompt('Hi');

        if ($this->mode !== 'succeed') {
            throw new RuntimeException('The job failed.');
        }
    }
}
