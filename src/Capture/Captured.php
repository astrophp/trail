<?php

namespace Astro\Trail\Capture;

/**
 * A value as it will be stored, and what had to be done to it on the way.
 */
final readonly class Captured
{
    /**
     * @param  array<string, int>  $truncated  payload path => the original length in characters
     * @param  bool  $dropped  whether something was cut away with no original length to report (too deep, too wide, or a key too long)
     */
    public function __construct(
        public mixed $value = null,
        public bool $redacted = false,
        public array $truncated = [],
        public bool $dropped = false,
    ) {}
}
