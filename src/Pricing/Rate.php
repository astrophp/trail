<?php

namespace Astro\Trail\Pricing;

/**
 * USD per one million tokens. A null rate is unknown, not free.
 */
final readonly class Rate
{
    public function __construct(
        public string $provider,
        public string $model,
        public ?float $input,
        public ?float $output,
        public ?float $cacheRead,
        public ?float $cacheWrite,
        public bool $custom,
    ) {}
}
