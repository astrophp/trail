<?php

namespace Astro\Trail\Tests\Fixtures\Capture\Hardening;

use Astro\Trail\Capture\Recorder;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Contracts\Events\Dispatcher;
use Laravel\Ai\Embeddings;
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
use Laravel\Ai\Prompts\AgentPrompt;
use Laravel\Ai\Responses\Data\ToolCall;
use ReflectionProperty;
use RuntimeException;

/**
 * Replays the events of a real run under invocation ids of the test's choosing, so thousands of
 * runs cost the SDK nothing and a test measures Trail alone. The events are copied from one run
 * of the real SDK, recorded once with Trail looking away.
 */
final class Replay
{
    /** @var array<string, object>|null */
    private static ?array $events = null;

    public static function reset(): void
    {
        self::$events = null;
    }

    /**
     * @return array<string, object>
     */
    private static function events(): array
    {
        if (self::$events !== null) {
            return self::$events;
        }

        $seen = [];

        app(Dispatcher::class)->listen('Laravel\Ai\Events\*', function (string $name, array $payload) use (&$seen): void {
            $seen[$payload[0]::class] ??= $payload[0];
        });

        Trail::withoutRecording(function (): void {
            AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'x']), 'Done']);
            (new AssistantAgent([new LookupTool]))->prompt('Hi');
        });

        return self::$events = $seen;
    }

    private static function event(string $class): object
    {
        return self::events()[$class] ?? throw new RuntimeException("No $class was recorded.");
    }

    public static function start(string $id, bool $streamed = false, ?object $prompt = null): void
    {
        $template = self::event(PromptingAgent::class);
        $class = $streamed ? StreamingAgent::class : PromptingAgent::class;

        event(new $class($id, $prompt ?? $template->prompt));
    }

    public static function step(string $id, int $number = 0, ?array $messages = null): void
    {
        $step = self::event(StartingStep::class);
        $done = self::event(StepCompleted::class);

        event(new StartingStep($id, $number, $step->agent, $step->provider, $step->model, false, $messages ?? $step->messages, $step->options));
        event(new StepCompleted($id, $number, $done->agent, $done->provider, $done->model, false, $done->response, 1.0));
    }

    public static function openStep(string $id, int $number = 0): void
    {
        $step = self::event(StartingStep::class);

        event(new StartingStep($id, $number, $step->agent, $step->provider, $step->model, false, $step->messages, $step->options));
    }

    public static function tool(string $id, string $toolId, mixed $result = 'ok', bool $finish = true): void
    {
        $invoking = self::event(InvokingTool::class);

        event(new InvokingTool($id, $toolId, $invoking->agent, $invoking->tool, ['query' => 'x']));

        if ($finish) {
            event(new ToolInvoked($id, $toolId, $invoking->agent, $invoking->tool, ['query' => 'x'], $result, 1.0));
        }
    }

    public static function finish(string $id): void
    {
        $done = self::event(AgentPrompted::class);

        event(new AgentPrompted($id, $done->prompt, $done->response));
    }

    public static function fail(string $id, ?\Throwable $exception = null): void
    {
        $prompt = self::event(PromptingAgent::class)->prompt;

        event(new AgentFailed($id, $prompt, $exception ?? new RuntimeException('failed')));
    }

    /** A whole run: start, the given number of steps, finish. */
    public static function run(string $id, int $steps = 1): void
    {
        self::start($id);

        for ($step = 0; $step < $steps; $step++) {
            self::step($id, $step);
        }

        self::finish($id);
    }

    public static function subAgent(string $id, string $parentId, ?string $parentToolId = null): void
    {
        $template = self::event(PromptingAgent::class)->prompt;

        $prompt = new AgentPrompt(
            $template->agent, 'child', [], $template->provider, $template->model,
            parentInvocationId: $parentId, parentToolInvocationId: $parentToolId,
        );

        event(new PromptingAgent($id, $prompt));
    }

    public static function approvalResolved(string $id): void
    {
        $agent = self::event(PromptingAgent::class)->prompt->agent;

        event(new ToolApprovalResolved($id, $agent, collect()));
    }

    public static function embeddingStart(string $id): void
    {
        $generated = self::generated();

        event(new GeneratingEmbeddings($id, $generated->provider, $generated->model, $generated->prompt));
    }

    public static function embeddingEnd(string $id): void
    {
        $generated = self::generated();

        event(new EmbeddingsGenerated($id, $generated->provider, $generated->model, $generated->prompt, $generated->response));
    }

    private static function generated(): EmbeddingsGenerated
    {
        if (isset(self::$events[EmbeddingsGenerated::class])) {
            return self::$events[EmbeddingsGenerated::class];
        }

        $seen = null;

        app(Dispatcher::class)->listen(EmbeddingsGenerated::class, function (EmbeddingsGenerated $event) use (&$seen): void {
            $seen = $event;
        });

        Trail::withoutRecording(function (): void {
            Embeddings::fake([[[0.1, 0.2]]]);
            Embeddings::for(['a'])->generate();
        });

        return self::$events[EmbeddingsGenerated::class] = $seen ?? throw new RuntimeException('No embeddings event was recorded.');
    }

    /**
     * Register an application listener that runs before the ones Trail registered when the provider booted.
     */
    public static function first(string $event, \Closure $listener): void
    {
        $events = app(Dispatcher::class);
        $events->listen($event, $listener);

        $property = new ReflectionProperty($events, 'listeners');
        $all = $property->getValue($events);
        $mine = array_pop($all[$event]);
        array_unshift($all[$event], $mine);
        $property->setValue($events, $all);
    }

    /**
     * Remove every listener Trail registered, so the same call can be made as if Trail were not
     * installed. There is no way back within a test.
     */
    public static function detach(): void
    {
        $events = app(Dispatcher::class);

        foreach ([
            PromptingAgent::class, StreamingAgent::class, AgentStreamed::class,
            StartingStep::class, StepCompleted::class, InvokingTool::class,
            ToolInvoked::class, StepFailed::class, ToolFailed::class,
            AgentFailedOver::class, AgentFailed::class, GeneratingEmbeddings::class,
            EmbeddingsGenerated::class, ProviderFailedOver::class,
            ToolApprovalResolved::class, AgentPrompted::class,
        ] as $class) {
            $events->forget($class);
        }
    }

    /**
     * What the recorder holds right now: runs in flight, traces buffered, embeddings calls open and skipped ids remembered.
     *
     * @return array{runs: int, buffers: int, embeddings: int, skipped: int}
     */
    public static function held(): array
    {
        $recorder = app(Recorder::class);
        $counts = [];

        foreach (['runs', 'buffers', 'embeddings', 'skipped'] as $name) {
            $property = new ReflectionProperty(Recorder::class, $name);
            $counts[$name] = count($property->getValue($recorder));
        }

        return $counts;
    }

    /** Milliseconds a callback takes. */
    public static function ms(callable $callback): float
    {
        $start = hrtime(true);
        $callback();

        return (hrtime(true) - $start) / 1e6;
    }

    /** Bytes in use after a collection. */
    public static function memory(): int
    {
        gc_collect_cycles();

        return memory_get_usage();
    }

    /** Print a measurement when TRAIL_HARDENING_REPORT is set. */
    public static function say(string $line): void
    {
        if (getenv('TRAIL_HARDENING_REPORT')) {
            fwrite(STDERR, "\n[report] $line\n");
        }
    }
}
