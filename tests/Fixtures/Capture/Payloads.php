<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

use Astro\Trail\Capture\Payload;

final class Payloads
{
    /**
     * A payload capturer with the defaults, or with the given settings.
     */
    public static function make(mixed ...$settings): Payload
    {
        return new Payload(...$settings);
    }
}
