<?php

namespace Astro\Trail\Capture;

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Storage\Contracts\TraceStore;
use Illuminate\Contracts\Container\Container;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\Providers\TextProvider;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\InvokingTool;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Events\StepCompleted;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Responses\StructuredAgentResponse;
use Laravel\Ai\Tools\ToolNameResolver;
use ReflectionClass;
use Throwable;

/**
 * Turns SDK events into traces. It holds every piece of in-flight state itself, keyed by the
 * invocation id the SDK puts on each event, and issues no database queries until a trace is written.
 */
class Recorder
{
    private const ANONYMOUS_AGENT = 'Anonymous agent';

    /** @var array<string, Run> */
    private array $runs = [];

    /** @var array<string, RunBuffer> */
    private array $buffers = [];

    public function __construct(
        private readonly Container $container,
        private readonly CostCalculator $costs,
    ) {}

    public function agentStarting(PromptingAgent $event): void
    {
        $prompt = $event->prompt;
        $provider = $this->driver($prompt->provider);
        $run = $this->runs[$event->invocationId] ?? null;

        if ($run !== null) {
            $run->attempt++;
            $run->step = null;
            $run->span->attempt = $run->attempt;
            $run->span->provider = $provider;
            $run->span->model = $prompt->model;

            if ($run->isRoot()) {
                $run->buffer->provider = $provider;
                $run->buffer->model = $prompt->model;
            }

            return;
        }

        $agent = $prompt->agent;
        $anonymous = (new ReflectionClass($agent))->isAnonymous();
        $class = $anonymous ? null : $agent::class;
        $name = $class === null ? self::ANONYMOUS_AGENT : class_basename($class);
        $now = Carbon::now();

        $span = new SpanDraft(
            id: $event->invocationId,
            type: SpanType::Agent,
            name: $name,
            status: Status::Running,
            startedAt: $now,
            agentClass: $class,
            provider: $provider,
            model: $prompt->model,
            input: ['prompt' => $prompt->prompt, 'system' => $this->systemPrompt($agent)],
            openedAt: (float) hrtime(true),
        );

        $buffer = $this->bufferFor($event, $span);
        $buffer->open($span);

        $this->runs[$event->invocationId] = new Run($event->invocationId, $buffer, $span);
    }

    public function stepStarting(StartingStep $event): void
    {
        $run = $this->runs[$event->invocationId] ?? null;

        if ($run === null) {
            return;
        }

        $run->step = $this->openStep(
            $run,
            $event->stepNumber,
            $this->driver($event->provider),
            $event->model,
            Carbon::now(),
            [
                'messages' => Payload::messages($event->messages),
                'options' => Payload::options($event->options),
            ],
        );
    }

    public function stepCompleted(StepCompleted $event): void
    {
        $run = $this->runs[$event->invocationId] ?? null;

        if ($run === null) {
            return;
        }

        $now = Carbon::now();
        $step = $run->step;

        if ($step === null || $step->stepNumber !== $event->stepNumber) {
            $step = $this->openStep(
                $run,
                $event->stepNumber,
                $this->driver($event->provider),
                $event->model,
                $now->copy()->subMicroseconds($this->microseconds($event->time)),
                ['messages' => null, 'options' => null],
            );
        }

        $response = $event->response;
        $usage = $response->usage;

        $step->status = Status::Completed;
        $step->durationMs = $event->time;
        $step->endedAt = $now;
        $step->respondingModel = $response->meta->model;
        $step->output = [
            'text' => Payload::value($response->text),
            'tool_calls' => Payload::toolCalls($response->toolCalls),
            'finish_reason' => $response->finishReason->value,
            ...($response->structured === null ? [] : ['structured' => Payload::value($response->structured)]),
        ];

        // A provider that sent no usage block shows up as zero tokens and no cache counts; that is not "free".
        $reported = $usage->inputTokens !== 0
            || $usage->outputTokens !== 0
            || $usage->cacheReadInputTokens !== null
            || $usage->cacheWriteInputTokens !== null;

        if ($reported) {
            $step->inputTokens = $usage->inputTokens;
            $step->outputTokens = $usage->outputTokens;
            $step->cacheReadTokens = $usage->cacheReadInputTokens;
            $step->cacheWriteTokens = $usage->cacheWriteInputTokens;
            $step->reasoningTokens = $usage->reasoningTokens;
        }

        $run->step = null;
    }

    public function toolInvoking(InvokingTool $event): void
    {
        $run = $this->runs[$event->invocationId] ?? null;

        if ($run === null) {
            return;
        }

        $this->openTool($run, $event, Carbon::now());
    }

    public function toolInvoked(ToolInvoked $event): void
    {
        $run = $this->runs[$event->invocationId] ?? null;

        if ($run === null) {
            return;
        }

        $now = Carbon::now();
        $span = $run->buffer->span($event->toolInvocationId);

        if ($span === null || $span->type !== SpanType::Tool) {
            $span = $this->openTool($run, $event, $now->copy()->subMicroseconds($this->microseconds($event->time)));
        }

        $span->status = Status::Completed;
        $span->durationMs = $event->time;
        $span->endedAt = $now;
        $span->output = ['result' => Payload::value($event->result)];
    }

    public function agentCompleted(AgentPrompted $event): void
    {
        $run = $this->runs[$event->invocationId] ?? null;

        if ($run === null) {
            return;
        }

        $now = Carbon::now();
        $response = $event->response;
        $duration = $run->span->openedAt === null ? null : (hrtime(true) - $run->span->openedAt) / 1e6;

        $run->span->status = Status::Completed;
        $run->span->endedAt = $now;
        $run->span->durationMs = $duration;
        $run->span->output = [
            'text' => Payload::value($response->text),
            ...($response instanceof StructuredAgentResponse ? ['structured' => Payload::value($response->structured)] : []),
        ];

        unset($this->runs[$event->invocationId]);

        if (! $run->isRoot()) {
            return;
        }

        $run->buffer->status = Status::Completed;
        $run->buffer->endedAt = $now;
        $run->buffer->durationMs = $duration;

        unset($this->buffers[$run->buffer->id]);

        $this->write($run->buffer);
    }

    /**
     * Write every trace in its current state, finished or not, and forget everything in flight.
     */
    public function flush(): void
    {
        $buffers = $this->buffers;

        $this->runs = [];
        $this->buffers = [];

        foreach ($buffers as $buffer) {
            $this->write($buffer);
        }
    }

    /**
     * The buffer the run's spans go into. Every run is a root for now, so it gets its own trace.
     */
    private function bufferFor(PromptingAgent $event, SpanDraft $span): RunBuffer
    {
        return $this->buffers[$event->invocationId] = new RunBuffer(
            id: $event->invocationId,
            type: SpanType::Agent,
            name: $span->name,
            startedAt: $span->startedAt,
            agentClass: $span->agentClass,
            provider: $span->provider,
            model: $span->model,
        );
    }

    /**
     * @param  array<string, mixed>  $input
     */
    private function openStep(Run $run, int $stepNumber, string $provider, string $model, Carbon $startedAt, array $input): SpanDraft
    {
        return $run->buffer->open(new SpanDraft(
            id: (string) Str::uuid7(),
            type: SpanType::Step,
            name: 'step',
            status: Status::Running,
            startedAt: $startedAt,
            parentId: $run->span->id,
            attempt: $run->attempt,
            stepNumber: $stepNumber,
            provider: $provider,
            model: $model,
            input: $input,
        ));
    }

    private function openTool(Run $run, InvokingTool|ToolInvoked $event, Carbon $startedAt): SpanDraft
    {
        try {
            $name = ToolNameResolver::resolve($event->tool);
        } catch (Throwable) {
            $name = class_basename($event->tool);
        }

        return $run->buffer->open(new SpanDraft(
            id: $event->toolInvocationId,
            type: SpanType::Tool,
            name: $name,
            status: Status::Running,
            startedAt: $startedAt,
            parentId: $run->span->id,
            attempt: $run->attempt,
            input: ['arguments' => Payload::value($event->arguments)],
        ));
    }

    /**
     * The provider's driver, which is what the price table is keyed by, not the connection name.
     */
    private function driver(TextProvider $provider): string
    {
        return $provider->driver();
    }

    /**
     * The agent's instructions, or null when they cannot be read. That failure is the developer's
     * own and the SDK raises it itself, so it is not reported here.
     */
    private function systemPrompt(Agent $agent): ?string
    {
        try {
            return (string) $agent->instructions();
        } catch (Throwable) {
            return null;
        }
    }

    private function microseconds(float $milliseconds): int
    {
        return (int) round($milliseconds * 1000);
    }

    /**
     * Price the steps, then store the trace. Pricing reads saved prices from the database, so it
     * happens here and never while a run is in flight. A failure to price or to store loses only this trace.
     */
    private function write(RunBuffer $buffer): void
    {
        Guard::run(function () use ($buffer): void {
            Guard::run(fn () => $this->price($buffer));

            $this->container->make(TraceStore::class)->store($buffer->trace(), $buffer->spans());
        });
    }

    private function price(RunBuffer $buffer): void
    {
        foreach ($buffer->drafts() as $span) {
            if ($span->type !== SpanType::Step || $span->inputTokens === null || $span->cost !== null) {
                continue;
            }

            $model = $span->respondingModel ?? $span->model;

            if ($span->provider === null || $model === null) {
                continue;
            }

            $span->cost = $this->costs->cost(
                $span->provider,
                $model,
                $span->inputTokens,
                $span->outputTokens,
                $span->cacheReadTokens,
                $span->cacheWriteTokens,
            );
        }
    }
}
