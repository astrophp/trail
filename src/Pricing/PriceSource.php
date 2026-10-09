<?php

namespace Astro\Trail\Pricing;

/**
 * Where the rate of a model comes from.
 */
enum PriceSource: string
{
    /** A row of the prices table for exactly this model. */
    case Saved = 'saved';

    /** The config entry of exactly this model id. */
    case Config = 'config';

    /** A shorter listed id that this model's id extends with a version suffix. */
    case Prefix = 'prefix';

    case None = 'none';
}
