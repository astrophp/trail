<?php

use Astro\Trail\Capture\Recorder;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Storage\Models\Price;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Sdk\FakeCohere;
use Laravel\Ai\Reranking;

it('requires an explicit reranking basis and its rate even for a reported zero', function (?array $group, ?float $expected, ?string $basis) {
    config(['trail.pricing.cohere.rank' => ['input' => 50, 'output' => 100] + ($group === null ? [] : ['reranking' => $group])]);
    FakeCohere::script([FakeCohere::response(['results' => [], 'meta' => ['billed_units' => ['input_tokens' => 20, 'search_units' => 0]]])]);
    Reranking::of(['document'])->rerank('query', 'cohere', 'rank');
    Trail::flush();
    $span = Span::query()->sole();
    expect($span->cost === null ? null : (float) $span->cost)->toBe($expected)->and($span->billing_basis)->toBe($basis);
})->with([
    'ordinary rates cannot price reranking' => [null, null, null],
    'search zero with missing rate' => [['basis' => 'search_units'], null, 'search_units'],
    'explicit search rate and zero units' => [['basis' => 'search_units', 'search_unit' => 0.1], 0.0, 'search_units'],
    'token pricing ignores search units' => [['basis' => 'input_tokens', 'input' => 2], 0.00004, 'input_tokens'],
]);

it('resolves saved price groups independently including explicit clears and legacy rows', function () {
    config(['trail.pricing.cohere.rank' => ['input' => 2, 'output' => 4, 'reranking' => ['basis' => 'search_units', 'search_unit' => 0.1]]]);
    $book = app(PriceBook::class);
    Price::create(['provider' => 'cohere', 'model' => 'rank', 'token_rates_set' => false, 'reranking_rates_set' => true, 'reranking_basis' => 'input_tokens', 'reranking_input' => 3]);
    expect($book->rateFor('cohere', 'rank')->input)->toBe(2.0)
        ->and($book->resolve('cohere', 'rank')->source->value)->toBe('config')
        ->and($book->resolveReranking('cohere', 'rank')->rate->rerankingInput)->toBe(3.0);
    Price::query()->update(['reranking_basis' => null, 'reranking_input' => null]);
    $book->flush();
    expect($book->resolveReranking('cohere', 'rank')->source->value)->toBe('saved')
        ->and($book->resolveReranking('cohere', 'rank')->rate->rerankingBasis)->toBeNull();
    Price::query()->delete();
    Price::create(['provider' => 'cohere', 'model' => 'rank']);
    $book->flush();
    expect($book->rateFor('cohere', 'rank')->input)->toBeNull()
        ->and($book->resolveReranking('cohere', 'rank')->rate->rerankingSearchUnit)->toBe(0.1);
});

it('freezes a completed unpriced decision across repeated writes and price changes', function () {
    config(['trail.pricing.cohere.rank' => []]);
    FakeCohere::script([FakeCohere::response(['results' => [], 'meta' => ['billed_units' => ['search_units' => 1]]])]);
    Reranking::of(['document'])->rerank('query', 'cohere', 'rank');
    $recorder = app(Recorder::class);
    $buffers = (new ReflectionProperty($recorder, 'buffers'))->getValue($recorder);
    $price = new ReflectionMethod($recorder, 'price');
    $price->invoke($recorder, array_values($buffers)[0]);
    config(['trail.pricing.cohere.rank.reranking' => ['basis' => 'search_units', 'search_unit' => 0.1]]);
    app(PriceBook::class)->flush();
    Trail::flush();
    expect(Span::query()->sole()->cost)->toBeNull()->and(Trace::query()->sole()->unpriced_span_count)->toBe(1);
});

it('rejects reranking costs outside the shared storage limit in both stores', function () {
    config(['trail.pricing.cohere.rank.reranking' => ['basis' => 'search_units', 'search_unit' => 999999]]);
    $assessment = app(CostCalculator::class)->reranking('cohere', 'rank', null, '1000.000000');
    expect($assessment)->toBe(['basis' => 'search_units', 'cost' => null]);
});
