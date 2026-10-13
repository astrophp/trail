<?php

namespace Astro\Trail\Storage;

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;

/**
 * The part of a span that feeds trace totals, whatever the span was read from.
 */
final readonly class SpanUsage
{
    public ?string $searchUnits;

    public function __construct(
        public SpanType $type,
        public ?int $inputTokens = null,
        public ?int $outputTokens = null,
        public ?int $cacheReadTokens = null,
        public ?int $cacheWriteTokens = null,
        public ?int $reasoningTokens = null,
        public ?float $cost = null,
        string|int|float|null $searchUnits = null,
        public Status $status = Status::Completed,
    ) {
        $this->searchUnits = SearchUnits::normalize($searchUnits);
    }

    public static function fromRecord(SpanRecord $span): self
    {
        return new self(
            $span->type,
            $span->inputTokens,
            $span->outputTokens,
            $span->cacheReadTokens,
            $span->cacheWriteTokens,
            $span->reasoningTokens,
            $span->cost,
            $span->searchUnits,
            $span->status,
        );
    }

    public function contributes(): bool
    {
        return in_array($this->type, SpanType::billable(), true);
    }

    public function reportedUsage(): bool
    {
        return $this->inputTokens !== null
            || $this->outputTokens !== null
            || $this->cacheReadTokens !== null
            || $this->cacheWriteTokens !== null
            || $this->reasoningTokens !== null
            || $this->searchUnits !== null;
    }
}
