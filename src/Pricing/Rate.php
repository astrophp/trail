<?php

namespace Astro\Trail\Pricing;

use DateTimeInterface;

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
        /** When a saved rate was last written; null for a config rate. */
        public ?DateTimeInterface $savedAt = null,
    ) {}
}
