<?php

namespace Astro\Trail\Http\Resources;

use DateTimeInterface;
use Illuminate\Support\Carbon;

/**
 * The one way the API writes a moment: ISO 8601 in UTC with milliseconds.
 */
final class Timestamp
{
    public static function format(?DateTimeInterface $moment): ?string
    {
        return $moment === null ? null : Carbon::instance($moment)->utc()->format('Y-m-d\TH:i:s.v\Z');
    }
}
