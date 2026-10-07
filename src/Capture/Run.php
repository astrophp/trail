<?php

namespace Astro\Trail\Capture;

/**
 * The state of one agent invocation: its agent span, the step currently open and how many
 * attempts (providers tried) it has made.
 */
final class Run
{
    public function __construct(
        public readonly string $invocationId,
        public readonly RunBuffer $buffer,
        public readonly SpanDraft $span,
        public int $attempt = 1,
        public ?SpanDraft $step = null,
    ) {}

    public function isRoot(): bool
    {
        return $this->buffer->id === $this->invocationId;
    }
}
