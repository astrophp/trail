<?php

namespace Astro\Trail\Queries;

/**
 * Whether a name from a request could be an agent's name at all, so one the column could not hold is
 * a 404 without reaching the database.
 */
final class AgentName
{
    /** The width of the name column, in characters. */
    private const MAX_LENGTH = 255;

    /**
     * A name is at least one character and at most the column's width. A NUL byte and a byte
     * sequence that is not UTF-8 are rejected outright by Postgres, which would make them a 500.
     */
    public static function isPossible(string $name): bool
    {
        return $name !== '' && ! str_contains($name, "\0") && mb_check_encoding($name, 'UTF-8') && mb_strlen($name) <= self::MAX_LENGTH;
    }
}
