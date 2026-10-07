<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

use Astro\Trail\Capture\Recorder;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\AgentFailedOver;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\InvokingTool;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Events\StepCompleted;
use Laravel\Ai\Events\StepFailed;
use Laravel\Ai\Events\ToolFailed;
use Laravel\Ai\Events\ToolInvoked;
use RuntimeException;
use TypeError;

/**
 * A recorder that fails on every event, the way a Trail bug would.
 */
class ThrowingRecorder extends Recorder
{
    public function agentStarting(PromptingAgent $event, bool $streamed = false): void
    {
        throw new RuntimeException('agentStarting failed');
    }

    public function stepStarting(StartingStep $event): void
    {
        throw new TypeError('stepStarting failed');
    }

    public function stepCompleted(StepCompleted $event): void
    {
        throw new RuntimeException('stepCompleted failed');
    }

    public function toolInvoking(InvokingTool $event): void
    {
        throw new TypeError('toolInvoking failed');
    }

    public function toolInvoked(ToolInvoked $event): void
    {
        throw new RuntimeException('toolInvoked failed');
    }

    public function agentCompleted(AgentPrompted $event): void
    {
        throw new TypeError('agentCompleted failed');
    }

    public function stepFailed(StepFailed $event): void
    {
        throw new TypeError('stepFailed failed');
    }

    public function toolFailed(ToolFailed $event): void
    {
        throw new RuntimeException('toolFailed failed');
    }

    public function agentFailedOver(AgentFailedOver $event): void
    {
        throw new TypeError('agentFailedOver failed');
    }

    public function agentFailed(AgentFailed $event): void
    {
        throw new RuntimeException('agentFailed failed');
    }

    public function flush(): void
    {
        throw new RuntimeException('flush failed');
    }
}
