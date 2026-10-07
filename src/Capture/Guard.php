<?php

namespace Astro\Trail\Capture;

use Closure;
use Throwable;

/**
 * The one place Trail code is allowed to fail. The SDK does not guard its listeners, so anything
 * Trail throws, errors included, would otherwise fail the developer's AI call.
 */
final class Guard
{
    /**
     * Run Trail code, reporting and swallowing anything it throws.
     */
    public static function run(Closure $callback): void
    {
        try {
            $callback();
        } catch (Throwable $e) {
            try {
                report($e);
            } catch (Throwable) {
                // Reporting must not fail the call either.
            }
        }
    }
}
