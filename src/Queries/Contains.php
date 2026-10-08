<?php

namespace Astro\Trail\Queries;

/**
 * The pattern of a case-insensitive "contains" search, the term taken literally.
 *
 * Escaped with `!`, which all three databases accept in an ESCAPE clause (a backslash is not an
 * escape character in SQLite). Compare it with `lower(column) like ? escape '!'`.
 */
final class Contains
{
    public static function pattern(string $term): string
    {
        return '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($term)).'%';
    }
}
