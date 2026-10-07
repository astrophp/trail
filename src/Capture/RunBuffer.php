<?php

namespace Astro\Trail\Capture;

use Astro\Trail\Enums\ErrorSource;
use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\SpanRecord;
use Astro\Trail\Storage\TraceRecord;
use DateTimeInterface;

/**
 * One trace in flight, with all its spans. Token totals, cost and span counts are never set here:
 * the store derives them from the step spans it is given.
 */
final class RunBuffer
{
    /** @var array<string, SpanDraft> */
    private array $spans = [];

    private int $sequence = 0;

    /**
     * @param  array<string, mixed>|null  $metadata
     */
    public function __construct(
        public readonly string $id,
        public SpanType $type,
        public string $name,
        public DateTimeInterface $startedAt,
        public Status $status = Status::Running,
        public ?string $agentClass = null,
        public bool $streamed = false,
        public bool $recovered = false,
        public bool $childFailed = false,
        public ?IssueKind $issueKind = null,
        public ?string $errorClass = null,
        public ?string $errorMessage = null,
        public ?ErrorSource $errorSource = null,
        public ?int $errorHttpStatus = null,
        public ?string $provider = null,
        public ?string $model = null,
        public ?string $conversationId = null,
        public ?string $userId = null,
        public ?string $userType = null,
        public ?float $durationMs = null,
        public ?string $promptExcerpt = null,
        public ?string $responseExcerpt = null,
        public ?array $metadata = null,
        public ?DateTimeInterface $endedAt = null,
    ) {}

    /**
     * Add a span to the trace, numbering it in the order spans are opened.
     */
    public function open(SpanDraft $span): SpanDraft
    {
        $span->traceId = $this->id;
        $span->sequence = ++$this->sequence;

        return $this->spans[$span->id] = $span;
    }

    public function span(string $id): ?SpanDraft
    {
        return $this->spans[$id] ?? null;
    }

    /**
     * Set one metadata key, leaving the others as they are.
     */
    public function setMetadata(string $key, mixed $value): void
    {
        $this->metadata = [...($this->metadata ?? []), $key => $value];
    }

    public function clearFailure(): void
    {
        $this->issueKind = null;
        $this->errorClass = null;
        $this->errorMessage = null;
        $this->errorSource = null;
        $this->errorHttpStatus = null;
    }

    public function fail(Failure $failure): void
    {
        $this->issueKind = $failure->issueKind;
        $this->errorClass = $failure->errorClass;
        $this->errorMessage = $failure->errorMessage;
        $this->errorSource = $failure->source;
        $this->errorHttpStatus = $failure->httpStatus;
    }

    /**
     * Fill in who the run belongs to. A value that is already known is never replaced, and an
     * unknown one never wipes a known one.
     */
    public function learn(?string $conversationId, ?string $userId, ?string $userType): void
    {
        $this->conversationId ??= $conversationId;

        if ($this->userId === null && $userId !== null && $userType !== null) {
            $this->userId = $userId;
            $this->userType = $userType;
        }
    }

    public function finished(): bool
    {
        return $this->status->isFinal();
    }

    public function trace(): TraceRecord
    {
        return new TraceRecord(
            id: $this->id,
            type: $this->type,
            name: $this->name,
            status: $this->status,
            startedAt: $this->startedAt,
            agentClass: $this->agentClass,
            streamed: $this->streamed,
            recovered: $this->recovered,
            childFailed: $this->childFailed,
            issueKind: $this->issueKind,
            errorClass: $this->errorClass,
            errorMessage: $this->errorMessage,
            errorSource: $this->errorSource,
            errorHttpStatus: $this->errorHttpStatus,
            provider: $this->provider,
            model: $this->model,
            conversationId: $this->conversationId,
            userId: $this->userId,
            userType: $this->userType,
            durationMs: $this->durationMs,
            promptExcerpt: $this->promptExcerpt,
            responseExcerpt: $this->responseExcerpt,
            metadata: $this->metadata,
            endedAt: $this->endedAt,
        );
    }

    /**
     * @return list<SpanRecord>
     */
    public function spans(): array
    {
        return array_values(array_map(fn (SpanDraft $span): SpanRecord => $span->toRecord(), $this->spans));
    }

    /**
     * The spans being captured, in the order they were opened.
     *
     * @return list<SpanDraft>
     */
    public function drafts(): array
    {
        return array_values($this->spans);
    }
}
