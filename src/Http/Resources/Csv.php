<?php

namespace Astro\Trail\Http\Resources;

/**
 * The cells and lines of the CSV files the API sends (RFC 4180, CRLF line ends): how a value is
 * written, quoted and guarded against spreadsheet formulas. A value that was not captured is an
 * empty cell, never a zero.
 */
abstract class Csv
{
    /** Tells a spreadsheet the file is UTF-8. */
    public const BYTE_ORDER_MARK = "\xEF\xBB\xBF";

    private const LINE_END = "\r\n";

    /** What starts a cell a spreadsheet would read as a formula. */
    private const FORMULA_STARTS = ['=', '+', '-', '@', "\t", "\r", "\n"];

    /**
     * One cell. Text is guarded against formulas; the numbers and booleans Trail produces are not
     * text and are never negative, so they are written as they are.
     */
    public static function cell(mixed $value): string
    {
        return match (true) {
            $value === null => '',
            is_bool($value) => $value ? 'true' : 'false',
            is_int($value) => (string) $value,
            is_float($value) => self::decimal($value),
            is_string($value) => self::text($value),
            default => '',
        };
    }

    /**
     * A number as a plain decimal: no exponent, no trailing zeros. Ten places are enough for every
     * amount Trail stores.
     */
    public static function decimal(float $value): string
    {
        $text = rtrim(rtrim(number_format($value, 10, '.', ''), '0'), '.');

        return $text === '-0' || $text === '' ? '0' : $text;
    }

    /**
     * Text from user input, prefixed with a single quote when a spreadsheet would run it: when it
     * starts with a formula character, or with whitespace (a no-break space included) and then one.
     */
    public static function text(string $value): string
    {
        $runs = $value !== '' && (in_array($value[0], self::FORMULA_STARTS, true) || preg_match('/\A(?:[ \t\r\n]|\xC2\xA0)+[=+\-@]/', $value) === 1);

        return $runs ? "'".$value : $value;
    }

    /**
     * Cells as a line: a cell with a comma, quote, CR or LF is quoted with its quotes doubled.
     *
     * @param  list<string>  $cells
     */
    public static function line(array $cells): string
    {
        $encoded = [];

        foreach ($cells as $cell) {
            $encoded[] = strpbrk($cell, ",\"\r\n") === false ? $cell : '"'.str_replace('"', '""', $cell).'"';
        }

        return implode(',', $encoded).self::LINE_END;
    }

    /**
     * @return array<string, mixed>
     */
    protected static function object(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $object = [];

        foreach ($value as $key => $item) {
            $object[(string) $key] = $item;
        }

        return $object;
    }
}
