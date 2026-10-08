<?php

namespace Astro\Trail\Queries;

/**
 * Whether an id from a request could be a conversation's id at all, so one the column could not
 * hold is a 404 without reaching the database.
 */
final class ConversationId
{
    /** The width of the id column, in characters. */
    private const MAX_LENGTH = 255;

    /**
     * An id is at least one character and at most the column's width. A NUL byte and a byte
     * sequence that is not UTF-8 are rejected outright by Postgres, which would make them a 500.
     */
    public static function isPossible(string $id): bool
    {
        return $id !== '' && ! str_contains($id, "\0") && mb_check_encoding($id, 'UTF-8') && mb_strlen($id) <= self::MAX_LENGTH;
    }
}
