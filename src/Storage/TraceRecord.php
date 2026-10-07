<?php

namespace Astro\Trail\Storage;

use Astro\Trail\Enums\ErrorSource;
use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use DateTimeInterface;

/**
 * The current state of a trace as the capture side knows it. Token totals, cost
 * and span counts are not part of it: the store derives them from the stored spans.
 */
final readonly class TraceRecord
{
    /**
     * @param  array<string, mixed>|null  $metadata
     */
    public function __construct(
        public string $id,
        public SpanType $type,
        public string $name,
        public Status $status,
        public DateTimeInterface $startedAt,
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
}
