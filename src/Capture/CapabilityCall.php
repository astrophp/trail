<?php

namespace Astro\Trail\Capture;

final readonly class CapabilityCall
{
    public function __construct(public RunBuffer $buffer, public SpanDraft $span, public bool $standalone, public CapabilityPayload $payload) {}
}
