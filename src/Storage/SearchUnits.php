<?php

namespace Astro\Trail\Storage;

use InvalidArgumentException;
use Throwable;

/** Exact six-place quantities, stored as signed BIGINT micro-units. */
final class SearchUnits
{
    public const MAX_MICRO_UNITS = 999_999_999_999_999_999;

    public static function normalize(string|int|float|null $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if (is_float($value)) {
            if (! is_finite($value)) {
                return self::unavailable();
            }

            // Find its shortest round-trip representation, independent of PHP's JSON precision.
            // This cannot recover any precision lost before the SDK dispatched its value.
            $float = $value;
            $point = localeconv()['decimal_point'];
            for ($precision = 1; $precision <= 17; $precision++) {
                $value = str_replace($point, '.', sprintf('%.*g', $precision, $float));
                if ((float) $value === $float) {
                    break;
                }
            }
            if ($float == 0.0) {
                $value = '0';
            }
        }

        $text = (string) $value;
        if (strlen($text) > 64 || preg_match('/^\+?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/D', $text, $parts) !== 1) {
            return self::unavailable();
        }

        $fraction = $parts[2] ?? '';
        $exponent = (int) ($parts[3] ?? 0);
        if (abs($exponent) > 64) {
            return self::unavailable();
        }

        $digits = $parts[1].$fraction;
        $places = strlen($fraction) - $exponent;
        if ($places < 0) {
            $digits .= str_repeat('0', -$places);
            $places = 0;
        }

        $digits = str_pad($digits, $places + 1, '0', STR_PAD_LEFT);
        $whole = ltrim(substr($digits, 0, strlen($digits) - $places), '0');
        $fraction = $places === 0 ? '' : rtrim(substr($digits, -$places), '0');
        if (strlen($whole) > 12 || strlen($fraction) > 6) {
            return self::unavailable();
        }

        return ($whole === '' ? '0' : $whole).'.'.str_pad($fraction, 6, '0');
    }

    public static function toStorage(string|int|float|null $value): ?int
    {
        $decimal = self::normalize($value);

        return $decimal === null ? null : (int) str_replace('.', '', $decimal);
    }

    public static function fromStorage(int|string|null $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $text = (string) $value;
        if (preg_match('/^\d{1,18}$/D', $text) !== 1) {
            return self::unavailable();
        }

        $digits = str_pad(ltrim($text, '0'), 7, '0', STR_PAD_LEFT);

        return substr($digits, 0, -6).'.'.substr($digits, -6);
    }

    /** Null values are absent evidence; a sum outside the supported range is unavailable. */
    public static function add(?string $total, ?string $value): ?string
    {
        $left = self::toStorage($total);
        $right = self::toStorage($value);
        if ($right === null) {
            return self::fromStorage($left);
        }

        if (($left ?? 0) > self::MAX_MICRO_UNITS - $right) {
            return self::unavailable();
        }

        return self::fromStorage(($left ?? 0) + $right);
    }

    private static function unavailable(): null
    {
        // A diagnostic never contains the captured value and never interrupts recording.
        try {
            report(new InvalidArgumentException('Search units are outside the supported nonnegative six-place range.'));
        } catch (Throwable) {
        }

        return null;
    }
}
