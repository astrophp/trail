<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Pricing\PriceSource;
use Astro\Trail\Pricing\Rate;
use Astro\Trail\Pricing\Resolution;

/**
 * What a model is priced at, where that comes from, and what it would be priced at without its own
 * saved row. The list and both writes send this one shape.
 */
final class PriceResource
{
    /**
     * @return array<string, mixed>
     */
    public static function of(PriceBook $prices, string $provider, string $model, bool $observed): array
    {
        $resolution = $prices->resolve($provider, $model);
        $saved = $resolution->source === PriceSource::Saved;
        $default = $saved ? $prices->resolve($provider, $model, withoutOwnRow: true) : $resolution;

        return [
            'provider' => $provider,
            'model' => $model,
            'rates' => self::rates($resolution->rate),
            'source' => $resolution->source->value,
            'via' => self::via($resolution),
            'default' => [
                'source' => $default->source->value,
                'via' => self::via($default),
                'rates' => self::rates($default->rate),
            ],
            'observed' => $observed,
            'saved_at' => $saved ? Timestamp::format($resolution->rate?->savedAt) : null,
        ];
    }

    /**
     * @return array{input: int|float|null, output: int|float|null, cache_read: int|float|null, cache_write: int|float|null}
     */
    private static function rates(?Rate $rate): array
    {
        return [
            'input' => self::number($rate?->input),
            'output' => self::number($rate?->output),
            'cache_read' => self::number($rate?->cacheRead),
            'cache_write' => self::number($rate?->cacheWrite),
        ];
    }

    /**
     * @return array{model: string, saved: bool}|null
     */
    private static function via(Resolution $resolution): ?array
    {
        if ($resolution->source !== PriceSource::Prefix || $resolution->rate === null) {
            return null;
        }

        return ['model' => $resolution->rate->model, 'saved' => $resolution->rate->custom];
    }

    /**
     * A whole rate is an integer, so 3 and 3.0 are one number on the wire.
     */
    private static function number(?float $value): int|float|null
    {
        return $value !== null && floor($value) === $value && abs($value) < 1e15 ? (int) $value : $value;
    }
}
