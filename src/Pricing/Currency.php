<?php

namespace Astro\Trail\Pricing;

use Illuminate\Contracts\Config\Repository;

/**
 * The one currency every amount in an install is in, read from trail.currency. Nothing is
 * converted: the code only labels the amounts and decides whether Trail's bundled prices,
 * which are US dollars, apply. A code is valid when it is three ASCII letters; it is not
 * looked up in the ISO 4217 registry.
 */
final class Currency
{
    /** The currency of the bundled prices, and the one used when trail.currency is absent or blank. */
    public const DEFAULT = 'USD';

    /**
     * The install's currency: the default when trail.currency is absent or blank, as an empty
     * TRAIL_CURRENCY= line leaves it, and null when it is set to anything else that is not a
     * three-letter code, an explicit null included.
     */
    public static function from(Repository $config): ?string
    {
        $configured = $config->get('trail.currency');

        if (! $config->has('trail.currency') || (is_string($configured) && trim($configured) === '')) {
            return self::DEFAULT;
        }

        return self::normalize($configured);
    }

    /**
     * The configured currency, or null when trail.currency is not a valid code.
     */
    public static function configured(): ?string
    {
        return self::from(config());
    }

    /**
     * The upper-cased code, or null when the value is not a three-letter code.
     */
    public static function normalize(mixed $configured): ?string
    {
        if (! is_string($configured)) {
            return null;
        }

        $code = strtoupper(trim($configured));

        return preg_match('/^[A-Z]{3}$/', $code) === 1 ? $code : null;
    }
}
