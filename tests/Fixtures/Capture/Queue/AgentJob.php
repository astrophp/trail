<?php

namespace Astro\Trail\Tests\Fixtures\Capture\Queue;

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use RuntimeException;
use Throwable;

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
        if ($this->mode !== 'fail-hook') {
            (new AssistantAgent)->prompt('Hi');
        }

        if ($this->mode !== 'succeed') {
            throw new RuntimeException('The job failed.');
        }
    }

    /**
     * Runs after the exception event and before the job-failed event, when the job fails for good.
     */
    public function failed(Throwable $exception): void
    {
        if ($this->mode === 'fail-hook') {
            (new AssistantAgent)->prompt('Hi');
        }
    }
}
