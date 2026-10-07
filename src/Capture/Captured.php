<?php

namespace Astro\Trail\Capture;

/**
 * A value as it will be stored, and what had to be done to it on the way.
 */
final readonly class Captured
{
    /**
     * @param  array<string, int>  $truncated  payload path => the original length in characters
     */
    public function __construct(
        public mixed $value = null,
        public bool $redacted = false,
        public array $truncated = [],
    ) {}
}
