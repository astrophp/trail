<?php

namespace Astro\Trail\Queries;

/**
 * The cells of a row of a grouped read, as the driver returns them: a count or a sum can be an
 * int, a float or a decimal string. A cell that is missing or is not what is asked for is zero or
 * empty here; a figure that can be absent is read with the nullable form.
 */
final class Row
{
    public static function int(object $row, string $column): int
    {
        return self::nullableInt($row, $column) ?? 0;
    }

    public static function nullableInt(object $row, string $column): ?int
    {
        $value = $row->{$column} ?? null;

        return is_numeric($value) ? (int) $value : null;
    }

    public static function nullableFloat(object $row, string $column): ?float
    {
        $value = $row->{$column} ?? null;

        return is_numeric($value) ? (float) $value : null;
    }

    public static function string(object $row, string $column): string
    {
        $value = $row->{$column} ?? null;

        return is_scalar($value) ? (string) $value : '';
    }

    public static function nullableString(object $row, string $column): ?string
    {
        $value = $row->{$column} ?? null;

        return is_string($value) ? $value : null;
    }
}
