<?php

namespace Astro\Trail\Pricing;

use Illuminate\Validation\ValidationException;

/**
 * The four rates of a saved price as a request sends them, checked against the prices table's
 * decimal(12, 6) columns. A value is saved as sent or refused, never rounded.
 */
final class RateInput
{
    /** The rates, in the order the API lists them. */
    public const FIELDS = ['input', 'output', 'cache_read', 'cache_write'];

    /** The most the column holds: six digits before the point, six after. */
    public const MAXIMUM = '999999.999999';

    private const DECIMALS = 6;

    /**
     * Every field, as the decimal text to store or null for a rate left blank.
     *
     * @param  array<array-key, mixed>  $body
     * @return array<string, ?string>
     *
     * @throws ValidationException with every invalid field
     */
    public static function from(array $body): array
    {
        $rates = [];
        $errors = [];

        foreach (self::FIELDS as $field) {
            $label = str_replace('_', ' ', $field);
            $value = $body[$field] ?? null;

            // Whitespace around a text is no part of the number, and a text of nothing else is blank.
            if (is_string($value)) {
                $value = trim($value, " \t\n\r\v\f");
            }

            if ($value === null || $value === '') {
                $rates[$field] = null;

                continue;
            }

            $text = self::text($value);

            if ($text === null) {
                $errors[$field] = ["The {$label} rate must be a number that is 0 or more."];
            } elseif (! self::fitsDecimals($text)) {
                $errors[$field] = ['The '.$label.' rate can have at most '.self::DECIMALS.' decimal places.'];
            } elseif (! self::fitsMaximum($text)) {
                $errors[$field] = ['The '.$label.' rate can be at most '.self::MAXIMUM.'.'];
            } else {
                $rates[$field] = $text;
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        return $rates;
    }

    /**
     * Plain decimal notation of a number that is finite and 0 or more, or null when the value is
     * none.
     */
    private static function text(mixed $value): ?string
    {
        if (is_int($value)) {
            return $value >= 0 ? (string) $value : null;
        }

        if (is_float($value)) {
            if (! is_finite($value) || $value < 0) {
                return null;
            }

            // A negative zero prints as "-0".
            return $value == 0.0 ? '0' : self::shortest($value);
        }

        if (is_string($value) && preg_match('/\A\d+(\.\d+)?\z/D', $value) === 1) {
            return $value;
        }

        return null;
    }

    /**
     * The fewest places that read back as the same float, which is what the sender wrote. A float
     * that none of fifteen places holds (1e-20) gets all fifteen, which is too many to be saved.
     */
    private static function shortest(float $value): string
    {
        for ($places = 0; $places < 15; $places++) {
            $text = number_format($value, $places, '.', '');

            if ((float) $text === $value) {
                return $text;
            }
        }

        return number_format($value, 15, '.', '');
    }

    private static function fitsDecimals(string $text): bool
    {
        $point = strpos($text, '.');

        return $point === false || strlen($text) - $point - 1 <= self::DECIMALS;
    }

    private static function fitsMaximum(string $text): bool
    {
        $whole = ltrim(explode('.', $text)[0], '0');

        return strlen($whole) <= 6;
    }
}
