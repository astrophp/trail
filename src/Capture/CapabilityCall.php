<?php

namespace Astro\Trail\Capture;

/**
 * A single call that has started and not yet ended: classification, reranking, image, audio or
 * transcription. Only classification and reranking share a payload budget between input and output.
 */
final readonly class CapabilityCall
{
    public function __construct(public RunBuffer $buffer, public SpanDraft $span, public bool $standalone, public ?CapabilityPayload $payload = null) {}
}
