<?php

namespace Astro\Trail\Queries;

/**
 * Whether an id from a URL could be a run's id at all. One answer for every endpoint that takes
 * one, so an id the column could not hold is a 404 without reaching the database.
 */
final class TraceId
{
    /** The width of the id column, in characters. */
    private const MAX_LENGTH = 64;

    /**
     * An id longer than the column is no run. A NUL byte and a byte sequence that is not UTF-8 are
     * rejected outright by Postgres, which would make them a 500.
     */
    public static function isPossible(string $id): bool
    {
        return mb_strlen($id) <= self::MAX_LENGTH && ! str_contains($id, "\0") && mb_check_encoding($id, 'UTF-8');
    }
}
