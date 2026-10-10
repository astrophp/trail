<?php

namespace Astro\Trail\Queries;

use DateTimeImmutable;
use DateTimeZone;
use Throwable;

/**
 * A start time as a datetime column returns it, which is in the application's timezone.
 */
final class StoredMoment
{
    public static function parse(mixed $stored): ?DateTimeImmutable
    {
        if (! is_string($stored)) {
            return null;
        }

        $timezone = config('app.timezone');

        try {
            return new DateTimeImmutable($stored, new DateTimeZone(is_string($timezone) ? $timezone : 'UTC'));
        } catch (Throwable) {
            return null;
        }
    }
}
