<?php

namespace Astro\Trail\Capture;

/**
 * An embeddings call that has started and not yet ended: its span, the buffer it records into, and
 * whether it is a trace of its own.
 */
final readonly class EmbeddingCall
{
    public function __construct(
        public RunBuffer $buffer,
        public SpanDraft $span,
        public bool $standalone,
    ) {}
}
