<?php

namespace Astro\Trail\Capture;

use Astro\Trail\Enums\ErrorSource;
use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\SpanRecord;
use DateTimeInterface;

/**
 * A span that is still being captured. It mirrors SpanRecord's fields but can change as events arrive.
 */
final class SpanDraft
{
    /**
     * @param  array<array-key, mixed>|null  $input
     * @param  array<array-key, mixed>|null  $output
     * @param  array<string, mixed>|null  $metadata
     * @param  float|null  $openedAt  A monotonic clock reading in nanoseconds, for measuring the span's own duration. Never stored.
     */
    public function __construct(
        public string $id,
        public SpanType $type,
        public string $name,
        public Status $status,
        public DateTimeInterface $startedAt,
        public string $traceId = '',
        public ?string $parentId = null,
        public ?string $agentClass = null,
        public int $attempt = 1,
        public int $sequence = 0,
        public ?int $stepNumber = null,
        public ?string $provider = null,
        public ?string $model = null,
        public ?string $respondingModel = null,
        public ?int $inputTokens = null,
        public ?int $outputTokens = null,
        public ?int $cacheReadTokens = null,
        public ?int $cacheWriteTokens = null,
        public ?int $reasoningTokens = null,
        public ?float $cost = null,
        public ?array $input = null,
        public ?array $output = null,
        public ?array $metadata = null,
        public bool $redacted = false,
        public bool $truncated = false,
        public ?IssueKind $issueKind = null,
        public ?string $errorClass = null,
        public ?string $errorMessage = null,
        public ?ErrorSource $errorSource = null,
        public ?int $errorHttpStatus = null,
        public ?float $durationMs = null,
        public ?DateTimeInterface $endedAt = null,
        public ?float $openedAt = null,
    ) {}

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

    public function toRecord(): SpanRecord
    {
        return new SpanRecord(
            id: $this->id,
            traceId: $this->traceId,
            type: $this->type,
            name: $this->name,
            status: $this->status,
            startedAt: $this->startedAt,
            parentId: $this->parentId,
            agentClass: $this->agentClass,
            attempt: $this->attempt,
            sequence: $this->sequence,
            stepNumber: $this->stepNumber,
            provider: $this->provider,
            model: $this->model,
            respondingModel: $this->respondingModel,
            inputTokens: $this->inputTokens,
            outputTokens: $this->outputTokens,
            cacheReadTokens: $this->cacheReadTokens,
            cacheWriteTokens: $this->cacheWriteTokens,
            reasoningTokens: $this->reasoningTokens,
            cost: $this->cost,
            input: $this->input,
            output: $this->output,
            metadata: $this->metadata,
            redacted: $this->redacted,
            truncated: $this->truncated,
            issueKind: $this->issueKind,
            errorClass: $this->errorClass,
            errorMessage: $this->errorMessage,
            errorSource: $this->errorSource,
            errorHttpStatus: $this->errorHttpStatus,
            durationMs: $this->durationMs,
            endedAt: $this->endedAt,
        );
    }
}
