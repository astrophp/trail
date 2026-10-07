<?php

namespace Astro\Trail\Capture;

use Astro\Trail\Enums\ErrorSource;
use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Storage\Contracts\TraceStore;
use Closure;
use Illuminate\Contracts\Container\Container;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\Providers\TextProvider;
use Laravel\Ai\Contracts\Tool;
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

    private const ANONYMOUS_TOOL = 'Anonymous tool';

    /** @var array<string, Run> */
    private array $runs = [];

    /** @var array<string, RunBuffer> */
    private array $buffers = [];

    /** How many traces a process with no flush point may hold before it writes the finished ones. */
    private const MAX_BUFFERED_TRACES = 100;

    public function __construct(
        private readonly Container $container,
        private readonly CostCalculator $costs,
        private readonly int $maxBufferedTraces = self::MAX_BUFFERED_TRACES,
    ) {}

    public function agentStarting(PromptingAgent $event, bool $streamed = false): void
    {
        $prompt = $event->prompt;
        $provider = $this->driver($prompt->provider);
        $run = $this->runs[$event->invocationId] ?? $this->revivable($event->invocationId, $streamed);

        if ($run !== null) {
            $this->startAttempt($run, $provider, $prompt->model);

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

        $buffer->streamed = $streamed;

        $run = new Run($event->invocationId, $buffer, $span, streamed: $streamed);
        $this->runs[$event->invocationId] = $run;

        if ($run->isRoot()) {
            // The only query issued while a run is in flight: it makes the run visible as it starts.
            Guard::run(fn () => $this->container->make(TraceStore::class)->start($buffer->trace()));
        }
    }

    /**
     * A run that failed and whose consumer iterated its stream again starts a new attempt under the
     * same invocation id, after the terminal event removed the run. Its trace is still buffered, so
     * the run is revived on it instead of starting a second trace over it. Once a flush has written
     * and dropped the buffer, a new run is all that is possible.
     */
    private function revivable(string $invocationId, bool $streamed): ?Run
    {
        $buffer = $this->buffers[$invocationId] ?? null;
        $span = $buffer?->span($invocationId);

        if ($buffer === null || $span === null) {
            return null;
        }

        // Back to running, as when the first attempt started. The earlier attempt's error stays on
        // the step or tool span that failed.
        $span->status = Status::Running;
        $span->endedAt = null;
        $span->durationMs = null;
        $span->output = null;
        $span->clearFailure();

        $buffer->status = Status::Running;
        $buffer->endedAt = null;
        $buffer->durationMs = null;
        $buffer->clearFailure();

        // The manual retry is not a failover, so the trace is not marked recovered.
        return $this->runs[$invocationId] = new Run($invocationId, $buffer, $span, attempt: $span->attempt, streamed: $streamed);
    }

    private function startAttempt(Run $run, string $provider, string $model): void
    {
        $this->abandonOpenSpans($run);

        $run->attempt++;
        $run->step = null;
        $run->lastText = null;
        $run->forgetFailure();
        $run->span->attempt = $run->attempt;
        $run->span->provider = $provider;
        $run->span->model = $model;

        if ($run->isRoot()) {
            $run->buffer->provider = $provider;
            $run->buffer->model = $model;
        }
    }

    /**
     * A step or tool still running when a new attempt starts belongs to an attempt that was walked
     * away from and will never close. It is closed as the sweep would close it.
     */
    private function abandonOpenSpans(Run $run): void
    {
        foreach ($run->buffer->drafts() as $span) {
            if ($span->parentId === $run->span->id && $span->status === Status::Running) {
                $span->status = Status::Incomplete;
                $span->issueKind = IssueKind::Abandoned;
            }
        }
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

        // Everything that can fail is built first, so a step is never completed with its output or usage missing.
        $output = $this->captured(fn (): array => [
            'text' => Payload::value($response->text),
            'tool_calls' => Payload::toolCalls($response->toolCalls),
            'finish_reason' => $response->finishReason->value,
            ...($response->structured === null ? [] : ['structured' => Payload::value($response->structured)]),
        ]);

        // A provider that sent no usage block shows up as zero tokens and no cache counts; that is not "free".
        $reported = $usage->inputTokens !== 0
            || $usage->outputTokens !== 0
            || $usage->cacheReadInputTokens !== null
            || $usage->cacheWriteInputTokens !== null;

        $step->status = Status::Completed;
        $step->durationMs = $event->time;
        $step->endedAt = $now;
        // A streamed step only knows the model it was requested against.
        $step->respondingModel = $run->streamed ? null : $response->meta->model;
        $step->output = $output;
        $step->inputTokens = $reported ? $usage->inputTokens : null;
        $step->outputTokens = $reported ? $usage->outputTokens : null;
        $step->cacheReadTokens = $reported ? $usage->cacheReadInputTokens : null;
        $step->cacheWriteTokens = $reported ? $usage->cacheWriteInputTokens : null;
        $step->reasoningTokens = $reported ? $usage->reasoningTokens : null;

        $run->step = null;
        $run->lastText = $response->text;
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

        $output = $this->captured(fn (): array => ['result' => Payload::value($event->result)]);

        $span->status = Status::Completed;
        $span->durationMs = $event->time;
        $span->endedAt = $now;
        $span->output = $output;
    }

    public function stepFailed(StepFailed $event): void
    {
        $run = $this->runs[$event->invocationId] ?? null;

        if ($run === null) {
            return;
        }

        $now = Carbon::now();
        $failure = Failure::from($event->exception, ErrorSource::Step);
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

        // A failed step reports no usage, and none is invented.
        $step->status = Status::Failed;
        $step->durationMs = $event->time;
        $step->endedAt = $now;
        $step->fail($failure);

        $run->step = null;
        $run->remember($event->exception, ErrorSource::Step);
    }

    public function toolFailed(ToolFailed $event): void
    {
        $run = $this->runs[$event->invocationId] ?? null;

        if ($run === null) {
            return;
        }

        $now = Carbon::now();
        $failure = Failure::from($event->exception, ErrorSource::Tool);
        $span = $run->buffer->span($event->toolInvocationId);

        if ($span === null || $span->type !== SpanType::Tool) {
            $span = $this->openTool($run, $event, $now->copy()->subMicroseconds($this->microseconds($event->time)));
        }

        // A tool failure does not decide how the run ends: the run's own terminal event does.
        $span->status = Status::Failed;
        $span->durationMs = $event->time;
        $span->endedAt = $now;
        $span->fail($failure);

        $run->remember($event->exception, ErrorSource::Tool);
    }

    public function agentFailedOver(AgentFailedOver $event): void
    {
        $run = $this->runs[$event->invocationId] ?? null;

        if ($run === null) {
            return;
        }

        // The failed attempt's error is already on the step or tool span that failed; the next
        // PromptingAgent opens the new attempt.
        $run->failovers++;
    }

    public function agentFailed(AgentFailed $event): void
    {
        $run = $this->runs[$event->invocationId] ?? null;

        if ($run === null) {
            return;
        }

        unset($this->runs[$event->invocationId]);

        $now = Carbon::now();
        $duration = $run->span->openedAt === null ? null : (hrtime(true) - $run->span->openedAt) / 1e6;
        $failure = Failure::from($event->exception, $run->sourceOf($event->exception));
        $runFailure = Failure::from($event->exception, ErrorSource::Run);

        // Whatever this run still had open died with it, and is never left running.
        foreach ($run->buffer->drafts() as $span) {
            if ($span->parentId === $run->span->id && $span->status === Status::Running) {
                $span->status = Status::Failed;
                $span->endedAt = $now;
                $span->durationMs = null;
                $span->fail($runFailure);
            }
        }

        $run->span->status = Status::Failed;
        $run->span->endedAt = $now;
        $run->span->durationMs = $duration;
        $run->span->fail($failure);

        if (! $run->isRoot()) {
            return;
        }

        $run->buffer->status = Status::Failed;
        $run->buffer->endedAt = $now;
        $run->buffer->durationMs = $duration;
        $run->buffer->fail($failure);

        Guard::run(fn () => $this->writeFinishedBeyondLimit());
    }

    public function agentCompleted(AgentPrompted $event): void
    {
        $run = $this->runs[$event->invocationId] ?? null;

        if ($run === null) {
            return;
        }

        // The run is finished whatever happens next, so it leaves the recorder before anything can fail.
        // Its trace stays buffered until the next flush.
        unset($this->runs[$event->invocationId]);

        $now = Carbon::now();
        $response = $event->response;
        $duration = $run->span->openedAt === null ? null : (hrtime(true) - $run->span->openedAt) / 1e6;
        $status = $response->hasPendingApprovals() ? Status::AwaitingApproval : Status::Completed;

        $output = $this->captured(fn (): array => [
            // A plain response's text is its last step's; a streamed response joins every step's.
            'text' => Payload::value($run->streamed ? ($run->lastText ?? $response->text) : $response->text),
            ...($response instanceof StructuredAgentResponse ? ['structured' => Payload::value($response->structured)] : []),
        ]);

        $run->span->status = $status;
        $run->span->endedAt = $now;
        $run->span->durationMs = $duration;
        $run->span->output = $output;

        if (! $run->isRoot()) {
            return;
        }

        $run->buffer->status = $status;
        $run->buffer->recovered = $run->failovers > 0;
        $run->buffer->endedAt = $now;
        $run->buffer->durationMs = $duration;

        Guard::run(fn () => $this->writeFinishedBeyondLimit());
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
     * A process that never reaches a flush point would hold finished traces forever. Past the limit
     * the finished ones are written and dropped; traces still being captured stay.
     */
    private function writeFinishedBeyondLimit(): void
    {
        if (count($this->buffers) <= $this->maxBufferedTraces) {
            return;
        }

        foreach ($this->buffers as $id => $buffer) {
            if (! $buffer->finished()) {
                continue;
            }

            unset($this->buffers[$id]);

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

    private function openTool(Run $run, InvokingTool|ToolInvoked|ToolFailed $event, Carbon $startedAt): SpanDraft
    {
        $name = $this->toolName($event->tool);

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
     * The tool's own name, which is user code. A tool that is an anonymous class and names itself
     * nothing is not called by its class name, which carries a file path.
     */
    private function toolName(Tool $tool): string
    {
        $anonymous = (new ReflectionClass($tool))->isAnonymous();

        if ($anonymous && ! is_callable([$tool, 'name'])) {
            return self::ANONYMOUS_TOOL;
        }

        try {
            return ToolNameResolver::resolve($tool);
        } catch (Throwable) {
            return $anonymous ? self::ANONYMOUS_TOOL : class_basename($tool);
        }
    }

    /**
     * Build a captured value, or null when that fails. The failure is reported, and the span it
     * belongs to is still recorded.
     *
     * @param  Closure(): array<array-key, mixed>  $build
     * @return array<array-key, mixed>|null
     */
    private function captured(Closure $build): ?array
    {
        $captured = null;

        Guard::run(function () use ($build, &$captured): void {
            $captured = $build();
        });

        return $captured;
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
