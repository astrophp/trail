<?php

use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Pricing\PriceBook;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('ships well formed prices', function () {
    $pricing = config('trail.pricing');

    expect($pricing)->toBeArray()->not->toBeEmpty();

    foreach ($pricing as $provider => $models) {
        expect($provider)->toBeString()->not->toBe('')
            ->and($models)->toBeArray()->not->toBeEmpty();

        foreach ($models as $model => $rates) {
            expect($model)->toBeString()->not->toBe('')
                ->and($rates)->toBeArray()
                ->and(array_diff(array_keys($rates), ['input', 'output', 'cache_read', 'cache_write']))->toBe([])
                ->and($rates)->toHaveKey('input');

            foreach ($rates as $rate) {
                expect(is_int($rate) || is_float($rate))->toBeTrue()
                    ->and($rate)->toBeGreaterThanOrEqual(0);
            }
        }
    }
});

it('never lists a model that is a version variant of another', function () {
    foreach (config('trail.pricing') as $provider => $models) {
        foreach (array_keys($models) as $key) {
            foreach (array_keys($models) as $other) {
                if ($key === $other || ! str_starts_with((string) $key, (string) $other)) {
                    continue;
                }

                expect(preg_match(PriceBook::VERSION_SUFFIX, substr((string) $key, strlen((string) $other))))
                    ->toBe(0, "{$provider}: {$key} is a variant of {$other}");
            }
        }
    }
});

it('prices through the shipped table', function () {
    $book = app(PriceBook::class);
    $calculator = app(CostCalculator::class);

    expect($book->rateFor('anthropic', 'claude-haiku-4-5-20251001')?->model)->toBe('claude-haiku-4-5')
        ->and($calculator->cost('openai', 'text-embedding-3-small', 1_000_000, null))->toEqualWithDelta(0.02, 1e-12)
        ->and($calculator->cost('openai', 'not-a-model', 1000, 100))->toBeNull();
});
