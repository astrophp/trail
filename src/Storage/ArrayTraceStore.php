<?php

namespace Astro\Trail\Storage;

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Contracts\TraceStore;
use Carbon\CarbonImmutable;
use Closure;
use DateTimeInterface;
use Illuminate\Support\Carbon;
use InvalidArgumentException;
use PHPUnit\Framework\Assert;

/**
 * An in-memory TraceStore for tests. It follows the same rules as the database
 * store but keeps records exactly as given, without its scrubbing, clamping or range guards.
 */
class ArrayTraceStore implements TraceStore
{
    private const MAX_ID_LENGTH = 64;

    /** @var array<string, TraceRecord> */
    private array $traces = [];

    /** @var array<string, array{stored: CarbonImmutable, updated: CarbonImmutable}> */
    private array $traceTimes = [];

    /** @var array<string, TraceTotals> */
    private array $totals = [];

    /** @var array<string, SpanRecord> */
    private array $spans = [];

    /** @var array<string, array{stored: CarbonImmutable, updated: CarbonImmutable}> */
    private array $spanTimes = [];

    public function start(TraceRecord $trace): void
    {
        $this->assertId($trace->id);

        if (isset($this->traces[$trace->id])) {
            return;
        }

        $this->insertTrace($trace);
    }

    public function store(TraceRecord $trace, array $spans): void
    {
        $this->assertId($trace->id);

        $seen = [];

        foreach ($spans as $span) {
            if ($span->traceId !== $trace->id) {
                throw new InvalidArgumentException("Span [{$span->id}] belongs to trace [{$span->traceId}], not [{$trace->id}].");
            }

            if (isset($seen[$span->id])) {
                throw new InvalidArgumentException("Span [{$span->id}] appears more than once.");
            }

            $seen[$span->id] = true;

            $this->assertId($span->id);

            if ($span->parentId !== null) {
                $this->assertId($span->parentId);
            }
        }

        $now = $this->now();
        $stored = $this->traces[$trace->id] ?? null;

        if ($stored === null) {
            $this->insertTrace($trace);
        } elseif (! ($stored->status->isFinal() && $trace->status === Status::Running)) {
            $this->traces[$trace->id] = $trace;
        }

        foreach ($spans as $span) {
            $existing = $this->spans[$span->id] ?? null;

            if ($existing === null) {
                $this->spans[$span->id] = $span;
                $this->spanTimes[$span->id] = ['stored' => $now, 'updated' => $now];

                continue;
            }

            if ($existing->traceId !== $trace->id || ($existing->status->isFinal() && $span->status === Status::Running)) {
                continue;
            }

            $this->spans[$span->id] = $span;
            $this->spanTimes[$span->id]['updated'] = $now;
        }

        $this->totals[$trace->id] = TraceTotals::ofRecords($this->spans($trace->id));
        $this->traceTimes[$trace->id]['updated'] = $now;
    }

    public function sweep(int $olderThanSeconds): int
    {
        $seconds = max(self::MINIMUM_STALE_SECONDS, $olderThanSeconds);
        $now = $this->now();
        $cutoff = $this->truncate(Carbon::now()->subSeconds($seconds));
        $marked = 0;

        foreach ($this->traces as $id => $trace) {
            if ($trace->status === Status::Running && $this->traceTimes[$id]['stored']->lt($cutoff)) {
                $this->traces[$id] = $this->abandonedTrace($trace);
                $this->traceTimes[$id]['updated'] = $now;
                $marked++;
            }
        }

        foreach ($this->spans as $id => $span) {
            if ($span->status === Status::Running && $this->spanTimes[$id]['stored']->lt($cutoff)) {
                $this->spans[$id] = $this->abandonedSpan($span);
                $this->spanTimes[$id]['updated'] = $now;
            }
        }

        return $marked;
    }

    public function prune(DateTimeInterface $before): int
    {
        $cutoff = $this->truncate($before);
        $deleted = 0;

        foreach (array_keys($this->traces) as $id) {
            if (! $this->traceTimes[$id]['stored']->lt($cutoff)) {
                continue;
            }

            foreach ($this->spans as $spanId => $span) {
                if ($span->traceId === $id) {
                    unset($this->spans[$spanId], $this->spanTimes[$spanId]);
                }
            }

            unset($this->traces[$id], $this->traceTimes[$id], $this->totals[$id]);
            $deleted++;
        }

        return $deleted;
    }

    public function clear(): void
    {
        $this->traces = $this->traceTimes = $this->totals = $this->spans = $this->spanTimes = [];
    }

    /**
     * @return list<TraceRecord> in the order they were first stored
     */
    public function traces(): array
    {
        return array_values($this->traces);
    }

    public function trace(string $id): ?TraceRecord
    {
        return $this->traces[$id] ?? null;
    }

    /**
     * @return list<SpanRecord> ordered by sequence, then id
     */
    public function spans(?string $traceId = null): array
    {
        $spans = array_values(array_filter(
            $this->spans,
            fn (SpanRecord $span) => $traceId === null || $span->traceId === $traceId,
        ));

        usort($spans, fn (SpanRecord $a, SpanRecord $b) => $a->sequence <=> $b->sequence ?: strcmp($a->id, $b->id));

        return $spans;
    }

    /**
     * The totals of a trace; a trace that is not stored has none.
     */
    public function totals(string $traceId): TraceTotals
    {
        return $this->totals[$traceId] ?? TraceTotals::ofRecords([]);
    }

    public function storedAt(string $traceId): ?CarbonImmutable
    {
        return $this->traceTimes[$traceId]['stored'] ?? null;
    }

    public function updatedAt(string $traceId): ?CarbonImmutable
    {
        return $this->traceTimes[$traceId]['updated'] ?? null;
    }

    public function spanStoredAt(string $spanId): ?CarbonImmutable
    {
        return $this->spanTimes[$spanId]['stored'] ?? null;
    }

    public function spanUpdatedAt(string $spanId): ?CarbonImmutable
    {
        return $this->spanTimes[$spanId]['updated'] ?? null;
    }

    /**
     * @param  (Closure(TraceRecord, list<SpanRecord>): bool)|null  $callback
     */
    public function assertRecorded(string $agentClass, ?Closure $callback = null): static
    {
        $matching = $this->tracesOf($agentClass);

        Assert::assertNotSame([], $matching, "No trace was recorded for [{$agentClass}].");

        if ($callback !== null) {
            $matched = false;

            foreach ($matching as $trace) {
                if ($callback($trace, $this->spans($trace->id))) {
                    $matched = true;

                    break;
                }
            }

            Assert::assertTrue($matched, "No trace recorded for [{$agentClass}] matched the callback.");
        }

        return $this;
    }

    public function assertNotRecorded(string $agentClass): static
    {
        Assert::assertSame([], $this->tracesOf($agentClass), "A trace was recorded for [{$agentClass}].");

        return $this;
    }

    /**
     * Assert an agent span of the given class was recorded in any trace, which is where a sub-agent
     * is recorded: under the run that delegated to it, not as a trace of its own.
     *
     * @param  (Closure(SpanRecord, TraceRecord): bool)|null  $callback
     */
    public function assertSpanRecorded(string $agentClass, ?Closure $callback = null): static
    {
        $matching = $this->agentSpansOf($agentClass);

        Assert::assertNotSame([], $matching, "No agent span was recorded for [{$agentClass}].");

        if ($callback !== null) {
            $matched = false;

            foreach ($matching as [$span, $trace]) {
                if ($callback($span, $trace)) {
                    $matched = true;

                    break;
                }
            }

            Assert::assertTrue($matched, "No agent span recorded for [{$agentClass}] matched the callback.");
        }

        return $this;
    }

    public function assertSpanNotRecorded(string $agentClass): static
    {
        Assert::assertSame([], $this->agentSpansOf($agentClass), "An agent span was recorded for [{$agentClass}].");

        return $this;
    }

    public function assertRecordedCount(int $count, ?string $agentClass = null): static
    {
        $actual = count($agentClass === null ? $this->traces : $this->tracesOf($agentClass));
        $subject = $agentClass === null ? 'traces' : "traces for [{$agentClass}]";

        Assert::assertSame($count, $actual, "Expected {$count} {$subject} to be recorded, but {$actual} were.");

        return $this;
    }

    public function assertNothingRecorded(): static
    {
        Assert::assertSame([], $this->traces, count($this->traces).' trace(s) were recorded, but none were expected.');

        return $this;
    }

    /**
     * @return list<array{SpanRecord, TraceRecord}>
     */
    private function agentSpansOf(string $agentClass): array
    {
        $agentClass = ltrim($agentClass, '\\');
        $matching = [];

        foreach ($this->spans() as $span) {
            $trace = $this->traces[$span->traceId] ?? null;

            if ($trace !== null && $span->type === SpanType::Agent && $span->agentClass === $agentClass) {
                $matching[] = [$span, $trace];
            }
        }

        return $matching;
    }

    /**
     * @return list<TraceRecord>
     */
    private function tracesOf(string $agentClass): array
    {
        $agentClass = ltrim($agentClass, '\\');

        return array_values(array_filter($this->traces, fn (TraceRecord $trace) => $trace->agentClass === $agentClass));
    }

    private function insertTrace(TraceRecord $trace): void
    {
        $now = $this->now();

        $this->traces[$trace->id] = $trace;
        $this->traceTimes[$trace->id] = ['stored' => $now, 'updated' => $now];
        $this->totals[$trace->id] = TraceTotals::ofRecords([]);
    }

    private function assertId(string $id): void
    {
        if (mb_strlen($id) > self::MAX_ID_LENGTH) {
            throw new InvalidArgumentException('Ids can be at most '.self::MAX_ID_LENGTH.' characters long.');
        }
    }

    private function now(): CarbonImmutable
    {
        return $this->truncate(Carbon::now());
    }

    // Whole milliseconds, like the database store, so both compare moments the same way.
    private function truncate(DateTimeInterface $moment): CarbonImmutable
    {
        $moment = CarbonImmutable::instance($moment);

        return $moment->setUnit('microsecond', intdiv($moment->microsecond, 1000) * 1000);
    }

    private function abandonedTrace(TraceRecord $r): TraceRecord
    {
        return new TraceRecord(
            id: $r->id,
            type: $r->type,
            name: $r->name,
            status: Status::Incomplete,
            startedAt: $r->startedAt,
            agentClass: $r->agentClass,
            streamed: $r->streamed,
            recovered: $r->recovered,
            childFailed: $r->childFailed,
            issueKind: IssueKind::Abandoned,
            errorClass: $r->errorClass,
            errorMessage: $r->errorMessage,
            errorSource: $r->errorSource,
            errorHttpStatus: $r->errorHttpStatus,
            provider: $r->provider,
            model: $r->model,
            conversationId: $r->conversationId,
            userId: $r->userId,
            userType: $r->userType,
            durationMs: $r->durationMs,
            promptExcerpt: $r->promptExcerpt,
            responseExcerpt: $r->responseExcerpt,
            metadata: $r->metadata,
            endedAt: $r->endedAt,
        );
    }

    private function abandonedSpan(SpanRecord $r): SpanRecord
    {
        return new SpanRecord(
            id: $r->id,
            traceId: $r->traceId,
            type: $r->type,
            name: $r->name,
            status: Status::Incomplete,
            startedAt: $r->startedAt,
            parentId: $r->parentId,
            agentClass: $r->agentClass,
            attempt: $r->attempt,
            sequence: $r->sequence,
            stepNumber: $r->stepNumber,
            provider: $r->provider,
            model: $r->model,
            respondingModel: $r->respondingModel,
            inputTokens: $r->inputTokens,
            outputTokens: $r->outputTokens,
            cacheReadTokens: $r->cacheReadTokens,
            cacheWriteTokens: $r->cacheWriteTokens,
            reasoningTokens: $r->reasoningTokens,
            cost: $r->cost,
            input: $r->input,
            output: $r->output,
            metadata: $r->metadata,
            redacted: $r->redacted,
            truncated: $r->truncated,
            issueKind: IssueKind::Abandoned,
            errorClass: $r->errorClass,
            errorMessage: $r->errorMessage,
            errorSource: $r->errorSource,
            errorHttpStatus: $r->errorHttpStatus,
            durationMs: $r->durationMs,
            endedAt: $r->endedAt,
        );
    }
}
