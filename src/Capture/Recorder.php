<?php

namespace Astro\Trail\Capture;

use Astro\Trail\Enums\ErrorSource;
use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Exceptions\RecordingFailed;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\RecordingCandidate;
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
use Laravel\Ai\Events\ToolApprovalResolved;
use Laravel\Ai\Events\ToolFailed;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Gateway\ParentInvocation;
use Laravel\Ai\Messages\AssistantMessage;
use Laravel\Ai\Messages\Message;
use Laravel\Ai\Messages\ToolResultMessage;
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

    /** @var array<string, true> traces whose run has ended, oldest first, waiting for the next flush */
    private array $finished = [];

    /** @var array<string, array<string, true>> the open embeddings calls under a span, by that span */
    private array $embeddingsByParent = [];

    /** How many traces one terminal event may write once more are held than the limit allows. */
    private const WRITES_PER_EVENT = 2;

    /** How long Trail stops writing after the store fails like a store that is unavailable, in nanoseconds. */
    private const OUTAGE_PAUSE = 30_000_000_000;

    /** Set while Trail is inside one of its own calls to the store. */
    private int $writing = 0;

    private ?int $writesPausedUntil = null;

    /** How many skipped invocation ids a process with no flush point remembers. */
    private const MAX_SKIPPED_IDS = 1000;

    /** @var array<string, true> invocation ids of runs that were decided against, in the order they were */
    private array $skipped = [];

    /** How many traces a process with no flush point may hold before it writes the finished ones. */
    private const MAX_BUFFERED_TRACES = 100;

    /**
     * @param  (Closure(): int)|null  $clock  nanoseconds on a monotonic clock; replaceable in tests
     */
    public function __construct(
        private readonly Container $container,
        private readonly CostCalculator $costs,
        private ?Payload $payload = null,
        private readonly int $maxBufferedTraces = self::MAX_BUFFERED_TRACES,
        private readonly int $maxSkippedIds = self::MAX_SKIPPED_IDS,
        private readonly ?Closure $clock = null,
    ) {}

    public function agentStarting(PromptingAgent $event, bool $streamed = false): void
    {
        $prompt = $event->prompt;
        $provider = $this->driver($prompt->provider);
        $isRoot = $prompt->parentInvocationId === null;

        // A run decided against stays decided against: a failover or a stream iterated again starts it again.
        if (isset($this->skipped[$event->invocationId])) {
            return;
        }

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

        // A run that starts because Trail is writing is not recorded, and neither are its later events.
        if ($this->writing > 0) {
            $this->skip($event->invocationId);

            return;
        }

        // The one decision about a top-level run. A sub-agent never asks: it follows a parent the
        // recorder knows, unless it starts where recording is off.
        $identity = null;

        if ($isRoot) {
            $candidate = function () use (&$identity, $class, $agent, $prompt, $provider): RecordingCandidate {
                $identity = Identity::of($agent);

                return new RecordingCandidate(SpanType::Agent, $class, $agent, $prompt->prompt, $identity->userId, $identity->userType, $provider, $prompt->model);
            };

            if (! $this->shouldRecord($candidate)) {
                $this->skip($event->invocationId);

                return;
            }
        } elseif (isset($this->runs[$prompt->parentInvocationId]) && $this->suppressed()) {
            // Started inside withoutRecording: left out, with everything under it and any later attempt.
            $this->skip($event->invocationId);

            return;
        }

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

        if ($isRoot) {
            $buffer->streamed = $streamed;
            $buffer->promptExcerpt = $this->excerpt(is_array($input->value) ? ($input->value['prompt'] ?? null) : null);
            $this->learnIdentity($buffer, $identity ?? Identity::of($agent));
            $this->recordResolvedApprovals($buffer, $prompt);
        }

        $run = new Run($event->invocationId, $buffer, $span, streamed: $streamed);
        $this->track($run);

        if ($isRoot) {
            Guard::run(fn () => $this->shed());

            // The only query issued while a run is in flight: it makes the run visible as it starts.
            $this->storing(fn () => $this->container->make(TraceStore::class)->start($buffer->trace()));
        }
    }

    /**
     * Whether a top-level run is recorded. Any failure of the decision itself means record: Trail's
     * own code breaking is not a reason to lose data.
     */
    /**
     * @param  RecordingCandidate|Closure(): RecordingCandidate  $candidate
     */
    private function shouldRecord(RecordingCandidate|Closure $candidate): bool
    {
        $record = true;

        Guard::run(function () use (&$record, $candidate): void {
            $record = $this->container->make(Sampler::class)->records($candidate);
        });

        return $record;
    }

    /**
     * Whether recording is switched off where a sub-agent or an embeddings call starts. If that
     * cannot be told, it is recorded.
     */
    private function suppressed(): bool
    {
        $suppressed = false;

        Guard::run(function () use (&$suppressed): void {
            $suppressed = $this->container->make(Sampler::class)->suppressed();
        });

        return $suppressed;
    }

    private function skip(string $invocationId): void
    {
        $this->skipped[$invocationId] = true;

        while (count($this->skipped) > $this->maxSkippedIds) {
            unset($this->skipped[array_key_first($this->skipped)]);
        }
    }

    private function learnIdentity(RunBuffer $buffer, Identity $identity): void
    {
        $buffer->learn($identity->conversationId, $identity->userId, $identity->userType);
    }

    /**
     * A run that resumes a pause is its own trace. The tool calls its decisions name are stored
     * when it starts, so they survive a resumed run that fails. A wildcard names no call: the SDK
     * reports the calls it settled afterwards, in approvalsResolved().
     */
    private function recordResolvedApprovals(RunBuffer $buffer, AgentPrompt $prompt): void
    {
        if (! $prompt->hasApprovalDecisions() || $prompt->approvalDecisions === null) {
            return;
        }

        $ids = [];

        foreach (array_keys($prompt->approvalDecisions->all()) as $id) {
            if ($id !== '*') {
                $ids[] = (string) $id;
            }
        }

        $buffer->setMetadata('resolved_tool_call_ids', $ids);
    }

    /**
     * The SDK's own statement of which tool calls a resume settled. It fires after the terminal
     * event, so the trace is found by its buffer and not by a run, and it is lost when the resumed
     * run fails: what the decisions named at the start is all that is known then. Only the ids are
     * taken from it; the tool spans come from the tool events.
     */
    public function approvalsResolved(ToolApprovalResolved $event): void
    {
        $ids = [];

        foreach ($event->toolResults as $result) {
            $ids[] = (string) $result->id;
        }

        $buffer = $this->buffers[$event->invocationId] ?? null;

        if ($buffer !== null) {
            $buffer->setMetadata('resolved_tool_call_ids', $this->united($buffer->metadata['resolved_tool_call_ids'] ?? null, $ids));

            return;
        }

        // A sub-agent that resumed a pause: its span is still in the buffer of the trace it ran in.
        foreach ($this->buffers as $buffer) {
            $span = $buffer->span($event->invocationId);

            if ($span !== null && $span->type === SpanType::Agent) {
                $span->setMetadata('resolved_tool_call_ids', $this->united($span->metadata['resolved_tool_call_ids'] ?? null, $ids));

                return;
            }
        }
    }

    /**
     * @param  list<string>  $ids
     * @return list<string>
     */
    private function united(mixed $known, array $ids): array
    {
        $union = is_array($known) ? array_values(array_filter($known, is_string(...))) : [];

        foreach ($ids as $id) {
            if (! in_array($id, $union, true)) {
                $union[] = $id;
            }
        }

        return $union;
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
        unset($this->finished[$invocationId]);

        return $this->track(new Run($invocationId, $buffer, $span, attempt: $span->attempt, streamed: $streamed));
    }

    private function startAttempt(Run $run, string $provider, string $model): void
    {
        $this->abandonOpenSpans($run);

        $run->attempt++;
        $run->step = null;
        $run->lastText = null;
        $run->sent = 0;
        $run->fingerprint = null;
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
                    $this->untrack($span->id);
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
                $this->untrack($span->id);
            }
        }
    }

    private function abandon(SpanDraft $span): void
    {
        $this->dropEmbedding($span->id);

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
            $this->stepInput($run, $event),
        );
    }

    /**
     * What a step's input stores. A step sends the whole history again, so only the messages that
     * the previous step of the same attempt did not send are stored, with the number it did send as
     * "messages_offset". The history of a step is the stored messages of the steps before it in the
     * attempt, in order, followed by its own. The first step of an attempt has offset 0 and holds
     * everything, ad-hoc history included. A history that is no longer than the previous one, or
     * that no longer has the same message where the previous one ended, was rewritten or
     * shortened, so it is stored whole, again with offset 0.
     */
    private function stepInput(Run $run, StartingStep $event): Captured
    {
        $total = count($event->messages);
        $offset = 0;

        // Only a history that still starts with what the previous step sent can be stored as what came after it.
        if ($run->sent > 0 && $total > $run->sent && $run->fingerprint === $this->fingerprint($event->messages[$run->sent - 1] ?? null)) {
            $offset = $run->sent;
        }

        $input = $this->capturing('input', fn (): array => [
            'messages' => $this->payload()->messages($offset === 0 ? $event->messages : array_slice($event->messages, $offset)),
            'messages_offset' => $offset,
            'options' => $this->payload()->options($event->options),
        ]);

        // What the previous step sent is only remembered once it was stored, so a step whose input
        // could not be built does not make the next one skip the messages it lost.
        if ($input->value !== null) {
            $run->sent = $total;
            $run->fingerprint = $this->fingerprint($event->messages[$total - 1] ?? null);
        }

        return $input;
    }

    /**
     * A cheap mark of a message: its kind, the length of its content, a hash of the start of it and
     * the ids of the calls and results it holds. Two histories that agree on the mark of the message
     * at the same place are taken to agree up to it; the whole history is never compared.
     */
    private function fingerprint(mixed $message): string
    {
        if (! $message instanceof Message) {
            return get_debug_type($message);
        }

        $content = $message->content ?? '';
        $ids = match (true) {
            $message instanceof AssistantMessage => $message->toolCalls->pluck('id')->implode(','),
            $message instanceof ToolResultMessage => $message->toolResults->pluck('id')->implode(','),
            default => '',
        };

        return $message->role->value.':'.strlen($content).':'.md5(substr($content, 0, 256)).':'.md5($ids);
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
        foreach (array_keys($this->embeddingsByParent[$tool->id] ?? []) as $id) {
            $span = $this->embeddings[$id]->span ?? null;

            if ($span !== null && $span->status === Status::Running) {
                $span->status = Status::Failed;
                $span->endedAt = $now;
                $span->durationMs = null;

                if ($failure !== null) {
                    $span->fail($failure);
                }
            }

            $this->dropEmbedding($id);
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

        $this->untrack($event->invocationId);

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
                $this->dropEmbedding($span->id);
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

        $this->finishedBuffer($run->buffer);
    }

    public function agentCompleted(AgentPrompted $event): void
    {
        $run = $this->runs[$event->invocationId] ?? null;

        if ($run === null) {
            return;
        }

        // The run is finished whatever happens next, so it leaves the recorder before anything can fail.
        // Its trace stays buffered until the next flush.
        $this->untrack($event->invocationId);

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

        // The conversation of a new run only exists by now; the response and the agent both report it.
        if ($identity !== null) {
            $this->learnIdentity($run->buffer, $identity);
        }

        $this->learnIdentity($run->buffer, Identity::ofResponse($response));

        $run->buffer->status = $status;
        $run->buffer->recovered = $run->failovers > 0;
        $run->buffer->endedAt = $now;
        $run->buffer->durationMs = $duration;

        $this->finishedBuffer($run->buffer);
    }

    public function embeddingsGenerating(GeneratingEmbeddings $event): void
    {
        if ($this->writing > 0) {
            return;
        }

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

            if ($run === null || $this->suppressed()) {
                return;
            }

            $span->parentId = $this->parentSpanId($run->buffer, $runId, $toolId);
            $span->attempt = $run->attempt;
            $run->buffer->open($span);
            $this->openEmbedding(new EmbeddingCall($run->buffer, $span, false));

            return;
        }

        if (! $this->shouldRecord(new RecordingCandidate(SpanType::Embedding, null, null, null, null, null, $span->provider, $span->model))) {
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
        $this->openEmbedding(new EmbeddingCall($buffer, $span, true));

        Guard::run(fn () => $this->shed());

        $this->storing(fn () => $this->container->make(TraceStore::class)->start($buffer->trace()));
    }

    public function embeddingsGenerated(EmbeddingsGenerated $event): void
    {
        $call = $this->embeddings[$event->invocationId] ?? null;

        if ($call === null) {
            return;
        }

        $this->dropEmbedding($event->invocationId);

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

        $this->finishedBuffer($call->buffer);
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

            $this->dropEmbedding($id);

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

                $this->finishedBuffer($call->buffer);
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
        foreach (array_keys($root->buffer->runIds) as $id) {
            $this->untrack($id);
        }
    }

    private function track(Run $run): Run
    {
        $this->runs[$run->invocationId] = $run;
        $run->buffer->runIds[$run->invocationId] = true;

        return $run;
    }

    private function untrack(string $invocationId): void
    {
        $run = $this->runs[$invocationId] ?? null;

        if ($run !== null) {
            unset($run->buffer->runIds[$invocationId]);
        }

        unset($this->runs[$invocationId]);
    }

    private function openEmbedding(EmbeddingCall $call): void
    {
        $id = $call->span->id;

        $this->embeddings[$id] = $call;
        $call->buffer->embeddingIds[$id] = true;

        if ($call->span->parentId !== null) {
            $this->embeddingsByParent[$call->span->parentId][$id] = true;
        }
    }

    private function dropEmbedding(string $id): void
    {
        $call = $this->embeddings[$id] ?? null;

        if ($call === null) {
            return;
        }

        unset($call->buffer->embeddingIds[$id], $this->embeddings[$id]);

        $parent = $call->span->parentId;

        if ($parent !== null) {
            unset($this->embeddingsByParent[$parent][$id]);

            if (($this->embeddingsByParent[$parent] ?? []) === []) {
                unset($this->embeddingsByParent[$parent]);
            }
        }
    }

    /**
     * Write every trace in its current state, finished or not, and forget everything in flight.
     * It is for between runs: a run that is still going when it is called is written as running,
     * and is not followed after that.
     */
    public function flush(): void
    {
        $buffers = $this->buffers;

        $this->runs = [];
        $this->buffers = [];
        $this->finished = [];
        $this->embeddings = [];
        $this->embeddingsByParent = [];
        $this->skipped = [];

        Guard::run(fn () => $this->container->make(Sampler::class)->flushed());

        foreach ($buffers as $buffer) {
            $this->write($buffer);
        }
    }

    private function finishedBuffer(RunBuffer $buffer): void
    {
        $this->finished[$buffer->id] = true;

        Guard::run(fn () => $this->shed());
    }

    /**
     * A process with no flush point would hold every trace forever. Past the limit, the oldest finished
     * trace is written and dropped, or, when none has finished, the oldest open one is written as
     * it stands (running, exactly as a flush would) and dropped with its runs. A process with no flush
     * point necessarily writes inside a call once it is over the limit; at most WRITES_PER_EVENT
     * traces are written by any one event, so no call pays for more than that and a backlog drains
     * over the calls that follow.
     */
    private function shed(): void
    {
        $written = 0;

        while ($written < self::WRITES_PER_EVENT && count($this->buffers) > $this->maxBufferedTraces) {
            $id = array_key_first($this->finished) ?? array_key_first($this->buffers);

            if ($id === null) {
                return;
            }

            $this->evict($id);
            $written++;
        }
    }

    private function evict(string $id): void
    {
        $buffer = $this->buffers[$id] ?? null;

        unset($this->buffers[$id], $this->finished[$id]);

        if ($buffer === null) {
            return;
        }

        // Written as it stands, and then gone: a later start for the same id must not begin it over.
        $this->skip($id);

        foreach (array_keys($buffer->runIds) as $runId) {
            $this->untrack($runId);
        }

        foreach (array_keys($buffer->embeddingIds) as $embeddingId) {
            $this->dropEmbedding($embeddingId);
        }

        $this->write($buffer);
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
            // With capture off nothing is stored, so nothing is built.
            if (! $this->payload()->capturing()) {
                return;
            }

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
        $this->storing(function () use ($buffer): void {
            try {
                $this->price($buffer);
            } catch (Throwable $e) {
                // The prices only add a cost. A store that is down fails the write itself just below.
                if (StoreFailure::meansUnavailable($e)) {
                    throw $e;
                }

                $this->reportWrite($e);
            }

            $this->container->make(TraceStore::class)->store($buffer->trace(), $buffer->spans());
        });
    }

    /**
     * A call into Trail's own tables. While one runs, nothing that starts is recorded, so an
     * application listener that reacts to Trail's queries cannot start runs that cause more queries.
     * After a failure that looks like a store that is down, writes are not attempted for a while:
     * one failure is reported, the traces that would have been written are dropped, and the callers
     * of the AI calls pay nothing more for it.
     *
     * @param  Closure(): void  $call
     */
    private function storing(Closure $call): void
    {
        if ($this->writesPausedUntil !== null && $this->now() < $this->writesPausedUntil) {
            return;
        }

        $this->writing++;

        try {
            $call();
        } catch (Throwable $e) {
            if (StoreFailure::meansUnavailable($e)) {
                $this->writesPausedUntil = $this->now() + self::OUTAGE_PAUSE;
            }

            $this->reportWrite($e);
        } finally {
            $this->writing--;
        }
    }

    private function now(): int
    {
        if ($this->clock !== null) {
            return ($this->clock)();
        }

        [$seconds, $nanoseconds] = hrtime();

        return $seconds * 1_000_000_000 + $nanoseconds;
    }

    /**
     * Report a failed write. Whatever the store threw is reported as a stand-in that holds no value
     * from the statement, since for Trail those are prompts and tool results.
     */
    private function reportWrite(Throwable $e): void
    {
        $report = RecordingFailed::because($e);

        Guard::run(function () use ($report): void {
            throw $report;
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
