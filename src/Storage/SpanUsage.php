<?php

namespace Astro\Trail\Storage;

use Astro\Trail\Enums\SpanType;

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
        );
    }

    public function contributes(): bool
    {
        return $this->type === SpanType::Step || $this->type === SpanType::Embedding;
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
