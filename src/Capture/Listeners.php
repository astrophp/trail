<?php

namespace Astro\Trail\Capture;

use Closure;
use Illuminate\Contracts\Container\Container;
use Illuminate\Contracts\Events\Dispatcher;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\InvokingTool;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Events\StepCompleted;
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
        $events->listen(StartingStep::class, static fn (StartingStep $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->stepStarting($event)));
        $events->listen(StepCompleted::class, static fn (StepCompleted $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->stepCompleted($event)));
        $events->listen(InvokingTool::class, static fn (InvokingTool $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->toolInvoking($event)));
        $events->listen(ToolInvoked::class, static fn (ToolInvoked $event) => self::handle($container, static fn (Recorder $recorder) => $recorder->toolInvoked($event)));
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
