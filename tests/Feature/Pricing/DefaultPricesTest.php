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
                ->and(array_diff(array_keys($rates), ['input', 'output', 'cache_read', 'cache_write', 'reranking']))->toBe([]);

            $tokens = array_diff_key($rates, ['reranking' => true]);
            expect($tokens !== [] || isset($rates['reranking']))->toBeTrue();

            if ($tokens !== []) {
                expect($tokens)->toHaveKey('input');
            }

            foreach ($tokens as $rate) {
                expect(is_int($rate) || is_float($rate))->toBeTrue()
                    ->and(is_finite((float) $rate))->toBeTrue()
                    ->and($rate)->toBeGreaterThanOrEqual(0);
            }

            if (isset($rates['reranking'])) {
                $group = $rates['reranking'];
                expect($group)->toBeArray()
                    ->and($group['basis'])->toBeIn(['input_tokens', 'search_units']);
                $key = $group['basis'] === 'input_tokens' ? 'input' : 'search_unit';
                expect(array_keys($group))->toBe(['basis', $key]);
                $rate = $group[$key];
                expect(is_int($rate) || is_float($rate))->toBeTrue()
                    ->and(is_finite((float) $rate))->toBeTrue()
                    ->and($rate)->toBeGreaterThanOrEqual(0);
            }
        }
    }
});

it('only repeats version rates for a documented canonical model and alias pair', function () {
    foreach (config('trail.pricing') as $provider => $models) {
        foreach (array_keys($models) as $key) {
            foreach (array_keys($models) as $other) {
                if ($key === $other || ! str_starts_with((string) $key, (string) $other)) {
                    continue;
                }

                if (preg_match(PriceBook::VERSION_SUFFIX, substr((string) $key, strlen((string) $other))) === 1) {
                    // xAI publishes both this canonical ID and its undated alias.
                    if ($provider === 'xai' && $key === 'grok-4.20-multi-agent-0309' && $other === 'grok-4.20-multi-agent') {
                        continue;
                    }

                    expect($models[$key])->not->toBe($models[$other], "{$provider}: {$key} repeats {$other}");
                }
            }
        }
    }
});

it('uses exact snapshot prices ahead of family rates', function () {
    $calculator = app(CostCalculator::class);

    expect($calculator->cost('openai', 'gpt-4o-2024-05-13', 1_000_000, 1_000_000))->toBe(20.0)
        ->and($calculator->cost('openai', 'gpt-4o-2024-08-06', 1_000_000, 1_000_000))->toBe(12.5)
        ->and($calculator->cost('cohere', 'command-r-03-2024', 1_000_000, 1_000_000))->toBe(2.0)
        ->and($calculator->cost('cohere', 'command-r-08-2024', 1_000_000, 1_000_000))->toBe(0.75);
});

it('estimates the refreshed token rates with cache usage', function (string $provider, string $model, int $input, int $output, int $read, int $write, float $expected) {
    expect(app(CostCalculator::class)->cost($provider, $model, $input, $output, $read, $write))->toEqualWithDelta($expected, 1e-12);
})->with([
    'Sonnet 5.5 cache hit correction' => ['anthropic', 'claude-sonnet-5-5', 1_000_000, 500_000, 200_000, 100_000, 6.67],
    'Groq half-price cache hits without premature rounding' => ['groq', 'openai/gpt-oss-20b', 1_000_000, 500_000, 500_000, 0, 0.20625],
    'DeepSeek peak estimate' => ['deepseek', 'deepseek-flash', 1_000_000, 1_000_000, 500_000, 0, 1.353],
    'Gemini routed 3.5 alias' => ['gemini', 'gemini-3.5-flash', 1_000_000, 1_000_000, 0, 0, 4.5],
    'Jina base token package' => ['jina', 'jina-embeddings-v4', 1_000_000, 0, 0, 0, 0.05],
]);

it('prices shipped rerankers with exactly their selected quantities', function (string $provider, string $model, ?int $tokens, ?string $units, string $basis, float $expected) {
    expect(app(CostCalculator::class)->reranking($provider, $model, $tokens, $units))->toBe(['basis' => $basis, 'cost' => $expected]);
})->with([
    'Cohere per search, not per thousand again' => ['cohere', 'rerank-v4.0-pro', 1_000_000, '2.000000', 'search_units', 0.005],
    'Cohere Fast' => ['cohere', 'rerank-v4.0-fast', null, '0.100001', 'search_units', 0.000200002],
    'Voyage reported tokens' => ['voyageai', 'rerank-3', 1_000_000, '500.000000', 'input_tokens', 0.05],
    'Voyage Lite' => ['voyageai', 'rerank-3-lite', 1_000_000, null, 'input_tokens', 0.02],
    'Jina package tokens' => ['jina', 'jina-reranker-v3.5', 1_000_000, '500.000000', 'input_tokens', 0.05],
]);

it('keeps missing quantities and unverifiable deployment prices unknown', function () {
    $calculator = app(CostCalculator::class);

    expect($calculator->reranking('cohere', 'rerank-v4.0-pro', 1_000_000, null))->toBe(['basis' => 'search_units', 'cost' => null])
        ->and($calculator->reranking('voyageai', 'rerank-3', null, '1.000000'))->toBe(['basis' => 'input_tokens', 'cost' => null])
        ->and($calculator->cost('azure', 'gpt-6-sol', 1000, 100))->toBeNull()
        ->and($calculator->cost('openrouter', 'openai/gpt-6-sol', 1000, 100))->toBeNull()
        ->and($calculator->cost('cohere', 'command-a-plus-05-2026', 1000, 100))->toBeNull()
        ->and($calculator->cost('cohere', 'embed-v4.0', 1000, null))->toBeNull();
});

it('prices through the shipped table', function () {
    $book = app(PriceBook::class);
    $calculator = app(CostCalculator::class);

    expect($book->rateFor('anthropic', 'claude-haiku-4-5-20251001')?->model)->toBe('claude-haiku-4-5')
        ->and($calculator->cost('openai', 'text-embedding-3-small', 1_000_000, null))->toEqualWithDelta(0.02, 1e-12)
        ->and($calculator->cost('openai', 'not-a-model', 1000, 100))->toBeNull();
});
