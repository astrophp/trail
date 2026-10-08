<?php

namespace Astro\Trail\Transcript;

/**
 * Whether two decoded JSON values are the same value. Stored payloads come back with their keys in
 * the order the database kept, and a number may come back as an int or a float, so neither
 * decides the answer. A payload is stored as JSON and read back as arrays, so an object whose keys
 * are 0, 1, 2 and so on is read back as the list it looks like, and is equal to it.
 */
final class JsonEquality
{
    public static function equal(mixed $left, mixed $right): bool
    {
        if (is_array($left) || is_array($right)) {
            return is_array($left) && is_array($right) && self::arraysEqual($left, $right);
        }

        // 1 and 1.0 are the same number; nothing else is coerced.
        if ((is_int($left) || is_float($left)) && (is_int($right) || is_float($right))) {
            return $left == $right;
        }

        return $left === $right;
    }

    /**
     * @param  array<array-key, mixed>  $left
     * @param  array<array-key, mixed>  $right
     */
    private static function arraysEqual(array $left, array $right): bool
    {
        if (count($left) !== count($right)) {
            return false;
        }

        // A list never equals a map. Decoded, an empty object and an empty list are the same value.
        if (array_is_list($left) !== array_is_list($right)) {
            return false;
        }

        if (array_is_list($left)) {
            foreach ($left as $position => $item) {
                if (! self::equal($item, $right[$position])) {
                    return false;
                }
            }

            return true;
        }

        foreach ($left as $key => $item) {
            if (! array_key_exists($key, $right) || ! self::equal($item, $right[$key])) {
                return false;
            }
        }

        return true;
    }
}
