<?php

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Storage\SearchUnits;
use Astro\Trail\Storage\SpanUsage;
use Astro\Trail\Storage\TraceTotals;

it('normalizes exact quantities and converts micro-units without floats', function ($value, $decimal, $stored) {
    expect(SearchUnits::normalize($value))->toBe($decimal)
        ->and(SearchUnits::toStorage($value))->toBe($stored)
        ->and(SearchUnits::fromStorage($stored))->toBe($decimal);
})->with([
    'absent' => [null, null, null],
    'zero' => [0.0, '0.000000', 0],
    'fraction' => [0.1, '0.100000', 100000],
    'smallest' => [0.000001, '0.000001', 1],
    'exponent' => ['1e-6', '0.000001', 1],
    'trailing zeros' => ['000.1000000', '0.100000', 100000],
    'integer' => [123, '123.000000', 123000000],
    'maximum' => ['999999999999.999999', '999999999999.999999', 999999999999999999],
]);

it('rejects unsupported quantities rather than rounding or clamping', function ($value) {
    expect(SearchUnits::normalize($value))->toBeNull();
})->with([
    [-1], [-0.1], [INF], [-INF], [NAN], ['0.0000001'], [0.1 + 0.2],
    ['1000000000000'], ['999999999999.9999999'], ['payload-secret'], ['1e999'], ['1e-999'],
]);

it('adds fractions exactly and keeps an overflowing total unavailable', function () {
    expect(SearchUnits::add('0.100000', '0.200000'))->toBe('0.300000')
        ->and(SearchUnits::add(null, '0.000000'))->toBe('0.000000')
        ->and(SearchUnits::add(null, null))->toBeNull()
        ->and(SearchUnits::add('999999999999.999999', '0.000001'))->toBeNull();

    $totals = TraceTotals::of([
        new SpanUsage(SpanType::Step, searchUnits: '999999999999.999999'),
        new SpanUsage(SpanType::Embedding, searchUnits: '0.000001'),
        new SpanUsage(SpanType::Step, searchUnits: '0.1'),
    ]);

    expect($totals->searchUnits)->toBeNull()
        ->and($totals->inputTokens)->toBeNull()
        ->and($totals->outputTokens)->toBeNull();
});

it('does not depend on application JSON precision settings', function () {
    $previous = ini_set('serialize_precision', '3');
    try {
        expect(SearchUnits::normalize(123.456789))->toBe('123.456789')
            ->and(SearchUnits::normalize(0.1 + 0.2))->toBeNull()
            ->and(SearchUnits::normalize(-0.0))->toBe('0.000000');
    } finally {
        ini_set('serialize_precision', $previous);
    }
});
