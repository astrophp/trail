<?php

namespace Astro\Trail\Pricing;

/**
 * How a model's rate was found: the rate, and where it came from. For a rate found through a
 * shorter id ({@see PriceSource::Prefix}) the rate is that id's own, and says which id it is.
 */
final readonly class Resolution
{
    public function __construct(
        public ?Rate $rate,
        public PriceSource $source,
    ) {}
}
