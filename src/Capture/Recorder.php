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
use Laravel\Ai\Events\EmbeddingsGenerated;
use Laravel\Ai\Events\GeneratingEmbeddings;
use Laravel\Ai\Events\InvokingTool;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\ProviderFailedOver;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Events\StepCompleted;
use Laravel\Ai\Events\StepFailed;
use Laravel\Ai\Events\ToolFailed;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Gateway\ParentInvocation;
use Laravel\Ai\Prompts\AgentPrompt;
use Laravel\Ai\Responses\AgentResponse;
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

    /** @var array<string, EmbeddingCall> keyed by the embeddings invocation id */
    private array $embeddings = [];

    /** How many traces a process with no flush point may hold before it writes the finished ones. */
    private const MAX_BUFFERED_TRACES = 100;

    public function __construct(
        private readonly Container $container,
        private readonly CostCalculator $costs,
        private ?Payload $payload = null,
        private readonly int $maxBufferedTraces = self::MAX_BUFFERED_TRACES,
    ) {}

    public function agentStarting(PromptingAgent $event, bool $streamed = false): void
    {
        $prompt = $event->prompt;
        $provider = $this->driver($prompt->provider);
        $run = $this->runs[$event->invocationId] ?? null;

        if ($run !== null) {
            $this->startAttempt($run, $provider, $prompt->model);

            return;
        }

        // Only a root can be revived: it is keyed on its own trace.
        if ($prompt->parentInvocationId === null && ($run = $this->revivable($event->invocationId, $streamed)) !== null) {
            $this->startAttempt($run, $provider, $prompt->model);

            return;
        }

        $agent = $prompt->agent;
        $anonymous = (new ReflectionClass($agent))->isAnonymous();
        $class = $anonymous ? null : $agent::class;
        $name = $class === null ? self::ANONYMOUS_AGENT : class_basename($class);

        $span = new SpanDraft(
            id: $event->invocationId,
            type: SpanType::Agent,
            name: $name,
            status: Status::Running,
            startedAt: Carbon::now(),
            agentClass: $class,
            provider: $provider,
            model: $prompt->model,
            openedAt: (float) hrtime(true),
        );

        $input = $this->capturing('input', fn (): array => [
            'prompt' => $prompt->prompt,
            'system' => $this->systemPrompt($agent),
            ...($prompt->attachments->isEmpty() ? [] : ['attachments' => $this->payload()->attachments($prompt->attachments)]),
        ]);
        $span->apply('input', $input);

        $buffer = $this->bufferFor($event, $span);

        if ($buffer === null) {
            return;
        }

        $span->parentId = $this->parentSpanId($buffer, $prompt->parentInvocationId, $prompt->parentToolInvocationId);
        $buffer->open($span);

        $isRoot = $prompt->parentInvocationId === null;

        $resolved = [];
        $resolvesRemaining = false;

        if ($isRoot) {
            $buffer->streamed = $streamed;
            $buffer->promptExcerpt = $this->excerpt(is_array($input->value) ? ($input->value['prompt'] ?? null) : null);
            $this->learnIdentity($buffer, Identity::of($agent));
            [$resolved, $resolvesRemaining] = $this->recordResolvedApprovals($buffer, $prompt);
        }

        $run = new Run($event->invocationId, $buffer, $span, streamed: $streamed, resolvedIds: $resolved, resolvesRemaining: $resolvesRemaining);
        $this->runs[$event->invocationId] = $run;

        if ($isRoot) {
            // The only query issued while a run is in flight: it makes the run visible as it starts.
            Guard::run(fn () => $this->container->make(TraceStore::class)->start($buffer->trace()));
        }
    }

    private function learnIdentity(RunBuffer $buffer, Identity $identity): void
    {
        $buffer->learn($identity->conversationId, $identity->userId, $identity->userType);
    }

    /**
     * A run that resumes a pause is its own trace. The tool calls its decisions name are stored
     * when it starts, so they survive a resumed run that fails. A wildcard names no call: it is
     * resolved from the response at the end, when the response reports which calls it settled.
     *
     * @return array{list<string>, bool} the calls named, and whether a wildcard decision covers the rest
     */
    private function recordResolvedApprovals(RunBuffer $buffer, AgentPrompt $prompt): array
    {
        if (! $prompt->hasApprovalDecisions() || $prompt->approvalDecisions === null) {
            return [[], false];
        }

        $ids = [];
        $wildcard = false;

        foreach (array_keys($prompt->approvalDecisions->all()) as $id) {
            if ($id === '*') {
                $wildcard = true;

                continue;
            }

            $ids[] = (string) $id;
        }

        $buffer->setMetadata('resolved_tool_call_ids', $ids);

        return [$ids, $wildcard];
    }

    /**
     * What a paused response is waiting for, read from the response of the terminal event. With
     * payload capture off, only the call and the tool are kept: no arguments and no reason.
     */
    private function pendingApprovals(AgentResponse $response): Captured
    {
        $payload = $this->payload();
        $pending = [];

        foreach ($response->pendingApprovals as $approval) {
            $pending[] = [
                'tool_call_id' => $approval->id,
                'tool' => $approval->tool,
                ...($payload->capturing() ? ['arguments' => $approval->arguments, 'reason' => $approval->reason] : []),
            ];
        }

        return $payload->capturing() ? $payload->capture($pending, 'pending_approvals') : new Captured($pending);
    }

    private function pendingApprovalsCaptured(AgentResponse $response): ?Captured
    {
        $captured = null;

        Guard::run(function () use (&$captured, $response): void {
            $captured = $this->pendingApprovals($response);
        });

        return $captured;
    }

    /**
     * The calls a wildcard decision settled: results the response holds for calls that this run did
     * not make itself, since the paused run made them.
     *
     * @return list<string>
     */
    private function resolvedWithWildcard(Run $run, AgentResponse $response): array
    {
        $ids = $run->resolvedIds;
        $own = $response->toolCalls->pluck('id')->all();

        foreach ($response->toolResults as $result) {
            if (! in_array($result->id, $own, true) && ! in_array($result->id, $ids, true)) {
                $ids[] = $result->id;
            }
        }

        return $ids;
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

        // Only a streamed trace is continued, and only by a streamed start: a plain run that happens
        // to reuse the id is not another attempt of it.
        if ($buffer === null || $span === null || ! $buffer->streamed || ! $streamed) {
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
        $buffer->recovered = false;
        $buffer->endedAt = null;
        $buffer->durationMs = null;
        $buffer->clearFailure();

        // The manual retry is not a failover, so the trace is not marked recovered; the terminal event decides.
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
        $abandoned = [];

        foreach ($run->buffer->drafts() as $span) {
            if ($span->status !== Status::Running) {
                continue;
            }

            // A sub-agent hangs directly under the run when its tool's span was missing. It is not the
            // run's own span, but it belongs to the attempt that was walked away from all the same.
            $directChild = $span->type === SpanType::Agent && $span->parentId === $run->span->id;

            if ($this->owns($run, $span) || $directChild) {
                $this->abandon($span);
                $abandoned[$span->id] = true;

                if ($directChild) {
                    unset($this->runs[$span->id]);
                }
            }
        }

        // Whatever a sub-agent or an embeddings call left running underneath those spans died with them,
        // at any depth. Spans open in sequence order, so a parent is always met before its children.
        foreach ($run->buffer->drafts() as $span) {
            if ($span->status === Status::Running && $span->parentId !== null && isset($abandoned[$span->parentId])) {
                $this->abandon($span);
                $abandoned[$span->id] = true;

                // A sub-agent from an abandoned attempt gets no more events.
                unset($this->runs[$span->id]);
            }
        }
    }

    private function abandon(SpanDraft $span): void
    {
        unset($this->embeddings[$span->id]);

        $span->status = Status::Incomplete;
        $span->issueKind = IssueKind::Abandoned;
    }

    /**
     * Whether a span belongs to the run itself: its steps and tools, and the embeddings its tools
     * made. A sub-agent's spans, its agent span included, belong to the sub-agent's own run.
     */
    private function owns(Run $run, SpanDraft $span): bool
    {
        if ($span->type === SpanType::Agent) {
            return false;
        }

        if ($span->parentId === $run->span->id) {
            return true;
        }

        $parent = $span->parentId === null ? null : $run->buffer->span($span->parentId);

        return $span->type === SpanType::Embedding
            && $parent !== null
            && $parent->type === SpanType::Tool
            && $parent->parentId === $run->span->id;
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
            $this->capturing('input', fn (): array => [
                'messages' => $this->payload()->messages($event->messages),
                'options' => $this->payload()->options($event->options),
            ]),
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
                new Captured(['messages' => null, 'options' => null]),
            );
        }

        $response = $event->response;
        $usage = $response->usage;

        // Remembered before anything that can fail, so the run's final answer never falls back to an earlier step's text.
        $run->lastText = $response->text;

        // Everything that can fail is built first, so a step is never completed with its output or usage missing.
        $output = $this->capturing('output', fn (): array => [
            'text' => $response->text,
            'tool_calls' => $this->payload()->toolCalls($response->toolCalls),
            'finish_reason' => $response->finishReason->value,
            ...($response->structured === null ? [] : ['structured' => $response->structured]),
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
        $step->apply('output', $output);
        $step->inputTokens = $reported ? $usage->inputTokens : null;
        $step->outputTokens = $reported ? $usage->outputTokens : null;
        $step->cacheReadTokens = $reported ? $usage->cacheReadInputTokens : null;
        $step->cacheWriteTokens = $reported ? $usage->cacheWriteInputTokens : null;
        $step->reasoningTokens = $reported ? $usage->reasoningTokens : null;

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

        $output = $this->capturing('output', fn (): array => ['result' => $event->result]);

        $span->status = Status::Completed;
        $span->durationMs = $event->time;
        $span->endedAt = $now;
        $span->apply('output', $output);

        // The tool returned while an embeddings call under it never ended: the tool caught its error.
        // Trail never saw the exception, so only the status is recorded.
        $this->closeEmbeddingsOf($run, $span, $now, null);
    }

    public function stepFailed(StepFailed $event): void
    {
        $run = $this->runs[$event->invocationId] ?? null;

        if ($run === null) {
            return;
        }

        $now = Carbon::now();
        $failure = $this->failure($event->exception, ErrorSource::Step);
        $step = $run->step;

        if ($step === null || $step->stepNumber !== $event->stepNumber) {
            $step = $this->openStep(
                $run,
                $event->stepNumber,
                $this->driver($event->provider),
                $event->model,
                $now->copy()->subMicroseconds($this->microseconds($event->time)),
                new Captured(['messages' => null, 'options' => null]),
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
        $failure = $this->failure($event->exception, ErrorSource::Tool);
        $span = $run->buffer->span($event->toolInvocationId);

        if ($span === null || $span->type !== SpanType::Tool) {
            $span = $this->openTool($run, $event, $now->copy()->subMicroseconds($this->microseconds($event->time)));
        }

        // A tool failure does not decide how the run ends: the run's own terminal event does.
        $span->status = Status::Failed;
        $span->durationMs = $event->time;
        $span->endedAt = $now;
        $span->fail($failure);

        $this->closeEmbeddingsOf($run, $span, $now, $failure);

        $run->remember($event->exception, ErrorSource::Tool);
    }

    /**
     * Close the embeddings calls of a tool that are still running. A failed embeddings call fires
     * no event of its own, so this is the first Trail learns of it.
     */
    private function closeEmbeddingsOf(Run $run, SpanDraft $tool, Carbon $now, ?Failure $failure): void
    {
        foreach ($run->buffer->drafts() as $span) {
            if ($span->type === SpanType::Embedding && $span->parentId === $tool->id && $span->status === Status::Running) {
                $span->status = Status::Failed;
                $span->endedAt = $now;
                $span->durationMs = null;
                unset($this->embeddings[$span->id]);

                if ($failure !== null) {
                    $span->fail($failure);
                }
            }
        }
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
        $failure = $this->failure($event->exception, $run->sourceOf($event->exception));
        $runFailure = $this->failure($event->exception, ErrorSource::Run);

        // Whatever this run still had open died with it, and is never left running.
        foreach ($run->buffer->drafts() as $span) {
            if ($span->status === Status::Running && $this->owns($run, $span)) {
                $span->status = Status::Failed;
                $span->endedAt = $now;
                $span->durationMs = null;
                $span->fail($runFailure);
                unset($this->embeddings[$span->id]);
            }
        }

        $run->span->status = Status::Failed;
        $run->span->endedAt = $now;
        $run->span->durationMs = $duration;
        $run->span->fail($failure);

        if (! $run->isRoot()) {
            // However the parent ends, one of its sub-agents failed.
            $run->buffer->childFailed = true;

            return;
        }

        $this->releaseChildren($run);

        // A new conversation has an id here only if a step completed before the failure.
        $this->learnIdentity($run->buffer, Identity::of($event->prompt->agent));

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

        $output = $this->capturing('output', fn (): array => [
            // A plain response's text is its last step's; a streamed response joins every step's.
            'text' => $run->streamed ? ($run->lastText ?? $response->text) : $response->text,
            ...($response instanceof StructuredAgentResponse ? ['structured' => $response->structured] : []),
        ]);

        $pending = $response->hasPendingApprovals() ? $this->pendingApprovalsCaptured($response) : null;
        $resolved = $run->resolvesRemaining ? $this->captured(fn (): array => $this->resolvedWithWildcard($run, $response)) : null;
        $identity = $run->isRoot() ? Identity::of($event->prompt->agent) : null;

        $run->span->status = $status;
        $run->span->endedAt = $now;
        $run->span->durationMs = $duration;
        $run->span->apply('output', $output);

        if (! $run->isRoot()) {
            if ($pending !== null) {
                $run->span->setMetadata('pending_approvals', $pending->value);
                $run->span->note($pending);
            }

            return;
        }

        $this->releaseChildren($run);

        if ($pending !== null) {
            $run->buffer->setMetadata('pending_approvals', $pending->value);
            $run->span->note($pending);
        }

        $run->buffer->responseExcerpt = $this->excerpt(is_array($output->value) ? ($output->value['text'] ?? null) : null);

        if ($resolved !== null) {
            $run->buffer->setMetadata('resolved_tool_call_ids', $resolved);
        }

        // The conversation of a new run only exists by now; the response and the agent both report it.
        if ($identity !== null) {
            $this->learnIdentity($run->buffer, $identity);
        }

        $this->learnIdentity($run->buffer, Identity::ofResponse($response));

        $run->buffer->status = $status;
        $run->buffer->recovered = $run->failovers > 0;
        $run->buffer->endedAt = $now;
        $run->buffer->durationMs = $duration;

        Guard::run(fn () => $this->writeFinishedBeyondLimit());
    }

    public function embeddingsGenerating(GeneratingEmbeddings $event): void
    {
        // The one place the SDK's own ambient parent ids are used: an embeddings call names no run.
        [$runId, $toolId] = ParentInvocation::current();

        $span = new SpanDraft(
            id: $event->invocationId,
            type: SpanType::Embedding,
            name: 'embeddings',
            status: Status::Running,
            startedAt: Carbon::now(),
            provider: $event->provider->driver(),
            model: $event->model,
            // How many inputs, never the texts themselves. Zero dimensions is the SDK's way of saying the model's native size.
            input: ['count' => count($event->prompt->inputs), 'dimensions' => $event->prompt->dimensions > 0 ? $event->prompt->dimensions : null],
            openedAt: (float) hrtime(true),
        );

        if ($runId !== null) {
            $run = $this->runs[$runId] ?? null;

            if ($run === null) {
                return;
            }

            $span->parentId = $this->parentSpanId($run->buffer, $runId, $toolId);
            $span->attempt = $run->attempt;
            $run->buffer->open($span);
            $this->embeddings[$event->invocationId] = new EmbeddingCall($run->buffer, $span, false);

            return;
        }

        $span->name = 'Embeddings';

        $buffer = $this->buffers[$event->invocationId] = new RunBuffer(
            id: $event->invocationId,
            type: SpanType::Embedding,
            name: 'Embeddings',
            startedAt: $span->startedAt,
            provider: $span->provider,
            model: $span->model,
        );
        $buffer->open($span);
        $this->embeddings[$event->invocationId] = new EmbeddingCall($buffer, $span, true);

        Guard::run(fn () => $this->container->make(TraceStore::class)->start($buffer->trace()));
    }

    public function embeddingsGenerated(EmbeddingsGenerated $event): void
    {
        $call = $this->embeddings[$event->invocationId] ?? null;

        if ($call === null) {
            return;
        }

        unset($this->embeddings[$event->invocationId]);

        $now = Carbon::now();
        $span = $call->span;
        $duration = $span->openedAt === null ? null : (hrtime(true) - $span->openedAt) / 1e6;
        $tokens = $event->response->usage->inputTokens;
        $output = $this->captured(fn (): array => ['count' => count($event->response->embeddings)]);

        $span->status = Status::Completed;
        $span->endedAt = $now;
        $span->durationMs = $duration;
        // A provider that sends no usage is read as zero, and a real call never uses none.
        $span->inputTokens = $tokens === 0 ? null : $tokens;
        $span->output = $output;

        if (! $call->standalone) {
            return;
        }

        $call->buffer->status = Status::Completed;
        $call->buffer->endedAt = $now;
        $call->buffer->durationMs = $duration;

        Guard::run(fn () => $this->writeFinishedBeyondLimit());
    }

    /**
     * An embeddings call that failed with an error the SDK can fail over on fires only this event,
     * which names no invocation: the next provider is tried as a new call with its own id. Calls are
     * synchronous, so the failed one is the most recently opened call still running against that
     * provider and model. The event also serves other SDK features; without such a call it is ignored.
     */
    public function providerFailedOver(ProviderFailedOver $event): void
    {
        $driver = $event->provider->driver();

        foreach (array_reverse($this->embeddings, true) as $id => $call) {
            if ($call->span->status !== Status::Running || $call->span->provider !== $driver || $call->span->model !== $event->model) {
                continue;
            }

            unset($this->embeddings[$id]);

            $now = Carbon::now();
            $span = $call->span;
            $duration = $span->openedAt === null ? null : (hrtime(true) - $span->openedAt) / 1e6;
            $failure = $this->failure($event->exception, ErrorSource::Run);

            $span->status = Status::Failed;
            $span->endedAt = $now;
            $span->durationMs = $duration;
            $span->fail($failure);

            if ($call->standalone) {
                $call->buffer->status = Status::Failed;
                $call->buffer->endedAt = $now;
                $call->buffer->durationMs = $duration;
                $call->buffer->fail($failure);

                Guard::run(fn () => $this->writeFinishedBeyondLimit());
            }

            return;
        }
    }

    /**
     * A finished root leaves no run behind in its trace: a sub-agent that never reached its terminal
     * event will never get one. Its spans stay as they are.
     */
    private function releaseChildren(Run $root): void
    {
        foreach ($this->runs as $id => $run) {
            if ($run->buffer === $root->buffer) {
                unset($this->runs[$id]);
            }
        }
    }

    /**
     * Write every trace in its current state, finished or not, and forget everything in flight.
     */
    public function flush(): void
    {
        $buffers = $this->buffers;

        $this->runs = [];
        $this->buffers = [];
        $this->embeddings = [];

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
     * The buffer the run's spans go into: a new trace for a root run, the parent's trace for a
     * sub-agent. A sub-agent whose parent Trail does not know is not recorded at all, so it never
     * becomes a trace of its own.
     */
    private function bufferFor(PromptingAgent $event, SpanDraft $span): ?RunBuffer
    {
        $parentId = $event->prompt->parentInvocationId;

        if ($parentId !== null) {
            $parent = $this->runs[$parentId] ?? null;

            // A span with this id already exists when a sub-agent's stream is iterated again; it is left as it was.
            return $parent === null || $parent->buffer->span($event->invocationId) !== null ? null : $parent->buffer;
        }

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
     * The span a sub-agent or an embeddings call hangs under: the tool call that started it when
     * that tool's span exists, otherwise the run that started it.
     */
    private function parentSpanId(RunBuffer $buffer, ?string $runId, ?string $toolId): ?string
    {
        if ($runId === null) {
            return null;
        }

        $tool = $toolId === null ? null : $buffer->span($toolId);

        return $tool !== null && $tool->type === SpanType::Tool ? $tool->id : $runId;
    }

    private function openStep(Run $run, int $stepNumber, string $provider, string $model, Carbon $startedAt, Captured $input): SpanDraft
    {
        $step = new SpanDraft(
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
        );
        $step->apply('input', $input);

        return $run->buffer->open($step);
    }

    private function openTool(Run $run, InvokingTool|ToolInvoked|ToolFailed $event, Carbon $startedAt): SpanDraft
    {
        $name = $this->toolName($event->tool);

        $tool = new SpanDraft(
            id: $event->toolInvocationId,
            type: SpanType::Tool,
            name: $name,
            status: Status::Running,
            startedAt: $startedAt,
            parentId: $run->span->id,
            attempt: $run->attempt,
        );
        $tool->apply('input', $this->capturing('input', fn (): array => ['arguments' => $event->arguments]));

        return $run->buffer->open($tool);
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
     * The payload capturer, built from config the first time it is needed. If it cannot be built,
     * nothing is captured: a payload that cannot be checked is never stored.
     */
    private function payload(): Payload
    {
        if ($this->payload !== null) {
            return $this->payload;
        }

        try {
            return $this->payload = $this->container->make(Payload::class);
        } catch (Throwable $e) {
            Guard::run(function () use ($e): void {
                throw $e;
            });

            return $this->payload = new Payload(capture: false);
        }
    }

    /**
     * A payload as it will be stored. If it cannot be built it is not stored, and the failure is reported.
     *
     * @param  Closure(): mixed  $build
     */
    private function capturing(string $field, Closure $build): Captured
    {
        $captured = new Captured;

        Guard::run(function () use (&$captured, $field, $build): void {
            $captured = $this->payload()->capture($build(), $field);
        });

        return $captured;
    }

    /**
     * An exception as it will be stored, its message redacted and truncated like any payload.
     */
    private function failure(Throwable $exception, ErrorSource $source): Failure
    {
        $failure = Failure::from($exception, $source);

        try {
            return $failure->withMessage($this->payload()->message($failure->errorMessage, 'error_message'));
        } catch (Throwable) {
            return $failure->withMessage(new Captured);
        }
    }

    /**
     * The start of a text, cut for the excerpt on a trace row.
     */
    private function excerpt(mixed $text): ?string
    {
        return is_string($text) && $text !== '' ? mb_substr($text, 0, Payload::EXCERPT_LENGTH, 'UTF-8') : null;
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
        if (! $this->payload()->capturesSystemPrompt()) {
            return null;
        }

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
            if (($span->type !== SpanType::Step && $span->type !== SpanType::Embedding) || $span->inputTokens === null || $span->cost !== null) {
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
