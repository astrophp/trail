<?php

namespace Astro\Trail\Storage;

use Astro\Trail\Enums\ErrorSource;
use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use DateTimeInterface;

/**
 * The current state of one span of a trace. Null usage, cost and timing mean
 * "not captured", never zero.
 */
final readonly class SpanRecord
{
    /**
     * @param  array<array-key, mixed>|null  $input
     * @param  array<array-key, mixed>|null  $output
     * @param  array<string, mixed>|null  $metadata
     */
    public function __construct(
        public string $id,
        public string $traceId,
        public SpanType $type,
        public string $name,
        public Status $status,
        public DateTimeInterface $startedAt,
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
    ) {}
}
