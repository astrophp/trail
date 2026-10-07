<?php

namespace Astro\Trail\Capture;

/**
 * What one call to Payload::value() has used up: how many values it may still visit and which
 * objects it is in the middle of expanding.
 */
final class PayloadContext
{
    /** @var array<int, true> */
    public array $expanding = [];

    public function __construct(public int $budget) {}
}
