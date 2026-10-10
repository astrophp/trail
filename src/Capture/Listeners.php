<?php

namespace Astro\Trail\Capture;

use Closure;
use Illuminate\Contracts\Container\Container;
use Illuminate\Contracts\Events\Dispatcher;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\AgentFailedOver;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\AgentStreamed;
use Laravel\Ai\Events\EmbeddingsGenerated;
use Laravel\Ai\Events\GeneratingEmbeddings;
use Laravel\Ai\Events\InvokingTool;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\ProviderFailedOver;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Events\StepCompleted;
use Laravel\Ai\Events\StepFailed;
use Laravel\Ai\Events\StreamingAgent;
use Laravel\Ai\Events\ToolApprovalResolved;
use Laravel\Ai\Events\ToolFailed;
use Laravel\Ai\Events\ToolInvoked;

/**
 * The SDK events Trail listens to. Each event class is registered by its own name, because the
 * dispatcher never delivers a subclass event to a listener of its parent class.
 */
final class Listeners
{
    public static function register(Dispatcher $events, Container $container): void
    {
        $events->listen(PromptingAgent::class, static fn (PromptingAgent $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->agentStarting($event)));
        // The stream events extend the plain ones, but the dispatcher never delivers a subclass to a
        // parent's listener, so each is registered by its own class.
        $events->listen(StreamingAgent::class, static fn (StreamingAgent $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->agentStarting($event, streamed: true)));
        $events->listen(AgentStreamed::class, static fn (AgentStreamed $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->agentCompleted($event)));
        $events->listen(StartingStep::class, static fn (StartingStep $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->stepStarting($event)));
        $events->listen(StepCompleted::class, static fn (StepCompleted $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->stepCompleted($event)));
        $events->listen(InvokingTool::class, static fn (InvokingTool $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->toolInvoking($event)));
        $events->listen(ToolInvoked::class, static fn (ToolInvoked $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->toolInvoked($event)));
        $events->listen(StepFailed::class, static fn (StepFailed $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->stepFailed($event)));
        $events->listen(ToolFailed::class, static fn (ToolFailed $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->toolFailed($event)));
        $events->listen(AgentFailedOver::class, static fn (AgentFailedOver $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->agentFailedOver($event)));
        $events->listen(AgentFailed::class, static fn (AgentFailed $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->agentFailed($event)));
        $events->listen(GeneratingEmbeddings::class, static fn (GeneratingEmbeddings $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->embeddingsGenerating($event)));
        $events->listen(EmbeddingsGenerated::class, static fn (EmbeddingsGenerated $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->embeddingsGenerated($event)));
        // AgentFailedOver extends this class and never reaches it: the dispatcher delivers an event to its own class's listeners only.
        $events->listen(ProviderFailedOver::class, static fn (ProviderFailedOver $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->providerFailedOver($event)));
        $events->listen(ToolApprovalResolved::class, static fn (ToolApprovalResolved $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->approvalsResolved($event)));
        $events->listen(AgentPrompted::class, static fn (AgentPrompted $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->agentCompleted($event)));
    }

    /**
     * Resolving the recorder is inside the guard too, so a broken binding cannot fail the AI call.
     *
     * @param  Closure(Recorder): void  $call
     */
    private static function handle(Container $container, Closure $call): void
    {
        Guard::run(function () use ($container, $call): void {
            $call($container->make(Recorder::class));
        });
    }
}
