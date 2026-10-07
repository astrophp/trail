<?php

use Astro\Trail\Pricing\CostCalculator;

function calculator(): CostCalculator
{
    config(['trail.pricing' => [
        'acme' => [
            'full' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.30, 'cache_write' => 3.75],
            'plain' => ['input' => 2.0, 'output' => 8.0],
            'embed' => ['input' => 0.02],
            'free' => ['input' => 0, 'output' => 0, 'cache_read' => 0, 'cache_write' => 0],
            'free-cache' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0, 'cache_write' => 0],
            'no-input' => ['output' => 8.0],
            'cached-only' => ['output' => 1.0, 'cache_read' => 1.0],
        ],
    ]]);

    return app(CostCalculator::class);
}

it('prices usage', function (string $model, ?int $in, ?int $out, ?int $read, ?int $write, float $expected) {
    $cost = calculator()->cost('acme', $model, $in, $out, $read, $write);

    expect($cost)->toBeFloat()->and($cost)->toEqualWithDelta($expected, 1e-12);
})->with([
    'input and output' => ['plain', 1000, 500, null, null, 0.006],
    'cached tokens' => ['full', 1000, 200, 600, 100, 0.004455],
    'cache read only' => ['full', 1000, 0, 600, null, 0.00138],
    'cache write only' => ['full', 1000, 0, null, 100, 0.003075],
    'zero cache tokens without rates' => ['plain', 100, 100, 0, 0, 0.001],
    'null cache tokens without rates' => ['plain', 100, 100, null, null, 0.001],
    'embedding with input only' => ['embed', 1000, null, null, null, 0.00002],
    'input zero output positive' => ['plain', 0, 100, null, null, 0.0008],
    'null output with input' => ['plain', 1000, null, null, null, 0.002],
    'null input with output' => ['plain', null, 1000, null, null, 0.008],
    'free rates' => ['free', 1000, 1000, 100, 100, 0.0],
    'free cache rates' => ['free-cache', 1000, 100, 600, 100, 0.0024],
    'cached more than input' => ['full', 100, 0, 500, 100, 0.00015 + 0.000375],
    'negative cache tokens' => ['plain', 1000, 0, -5, -5, 0.002],
    'vanishingly small' => ['embed', 1, null, null, null, 0.00000002],
    'resolved by suffix' => ['full-20251001', 1000, 200, 600, 100, 0.004455],
]);

it('does not round a tiny cost to zero', function () {
    expect(calculator()->cost('acme', 'embed', 1, null))->toBe(0.00000002);
});

it('reports a free rate as zero, not as unpriced', function () {
    expect(calculator()->cost('acme', 'free', 0, 0))->toBe(0.0)
        ->and(calculator()->cost('acme', 'free', 500, 500, 100, 100))->toBe(0.0);
});

it('is unpriced when it cannot be priced', function (string $provider, string $model, ?int $in, ?int $out, ?int $read, ?int $write) {
    expect(calculator()->cost($provider, $model, $in, $out, $read, $write))->toBeNull();
})->with([
    'unknown model' => ['acme', 'nope', 1000, 100, null, null],
    'unknown provider' => ['other', 'plain', 1000, 100, null, null],
    'bare prefix' => ['acme', 'plain-mini', 1000, 100, null, null],
    'no usage reported' => ['acme', 'plain', null, null, null, null],
    'no usage but cache tokens' => ['acme', 'full', null, null, 10, 10],
    'negative usage' => ['acme', 'plain', -1, -1, null, null],
    'cache read without a rate' => ['acme', 'plain', 1000, 100, 600, null],
    'cache write without a rate' => ['acme', 'plain', 1000, 100, null, 100],
    'output without a rate' => ['acme', 'embed', 1000, 100, null, null],
    'input without a rate' => ['acme', 'no-input', 1000, 100, null, null],
    'uncached input is zero but output has no rate' => ['acme', 'embed', 100, 10, 100, null],
]);

it('needs no input rate when all the input was cached', function () {
    expect(calculator()->cost('acme', 'cached-only', 100, 100, 100, null))->toEqualWithDelta(0.0002, 1e-12)
        ->and(calculator()->cost('acme', 'cached-only', 101, 100, 100, null))->toBeNull();
});

it('is a singleton', function () {
    expect(app(CostCalculator::class))->toBe(app(CostCalculator::class));
});
