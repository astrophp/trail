<?php

namespace Astro\Trail\Queries;

/**
 * The beginning of a run's id typed as far as a person copies it: hexadecimal digits and hyphens,
 * as the SDK's ids are spelt. It is read from the primary key as a range plus a `LIKE`, never the
 * `LIKE` alone: Postgres under a locale collation (the default of its images) does not serve a
 * leading-anchored `LIKE` from a btree index, and does serve a range. The range is wider than the
 * prefix where the collation ignores hyphens, and the `LIKE` makes it exact. The range's end is
 * worked out for these digits only, which sort in the same order in every collation; a beginning of
 * any other kind is not looked up here.
 */
final class TraceIdPrefix
{
    /** The shortest beginning that is looked up: the length the dashboard shows of an id before its ellipsis. */
    public const MINIMUM = 8;

    /**
     * @return array{from: string, to: ?string, pattern: string}|null null when the text is not such a beginning
     */
    public static function bounds(string $text): ?array
    {
        $prefix = mb_strtolower($text);

        if (strlen($prefix) < self::MINIMUM || preg_match('/\A[0-9a-f-]+\z/', $prefix) !== 1) {
            return null;
        }

        // Hyphens are ignored by some collations and not by others, so the range stops short of a trailing one.
        $base = rtrim($prefix, '-');

        if ($base === '') {
            return null;
        }

        return ['from' => $base, 'to' => self::successor($base), 'pattern' => $prefix.'%'];
    }

    /**
     * A text above every text that begins with the base: the base without its trailing `f` (the last
     * digit, which cannot be raised) and hyphens, its last digit raised by one. Null when nothing
     * is left, as the base is all `f`.
     */
    private static function successor(string $base): ?string
    {
        $base = rtrim($base, 'f-');

        if ($base === '') {
            return null;
        }

        $last = $base[strlen($base) - 1];

        // The digits are in the order 0-9 then a-f in every collation.
        return substr($base, 0, -1).($last === '9' ? 'a' : chr(ord($last) + 1));
    }
}
