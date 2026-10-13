<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Tests\Fixtures\Storage\Rows;

beforeEach(function () {
    Trail::auth(fn () => true);
    config(['trail.pricing.cohere.rank' => ['input' => 2, 'output' => 4, 'reranking' => ['basis' => 'search_units', 'search_unit' => 0.1]]]);
});

afterEach(function () {
    $this->app['env'] = 'testing';
});

it('saves, clears and resets reranking independently and preserves legacy empty-object token clears', function () {
    $url = '/trail/api/prices?provider=cohere&model=rank';
    $this->putJson($url, ['reranking' => ['basis' => 'input_tokens', 'input' => '3.123456']])->assertOk()
        ->assertJsonPath('data.rates.input', 2)->assertJsonPath('data.source', 'config')
        ->assertJsonPath('data.reranking.rates.input', 3.123456)->assertJsonPath('data.reranking.source', 'saved');
    $this->call('PUT', $url, [], [], [], ['CONTENT_TYPE' => 'application/json'], '{}')->assertOk()
        ->assertJsonPath('data.rates.input', null)->assertJsonPath('data.source', 'saved')
        ->assertJsonPath('data.reranking.rates.input', 3.123456);
    $this->putJson($url, ['reranking' => null])->assertOk()->assertJsonPath('data.reranking.rates.basis', null)
        ->assertJsonPath('data.reranking.source', 'saved');
    $this->deleteJson($url.'&group=reranking')->assertOk()->assertJsonPath('data.reranking.rates.search_unit', 0.1)
        ->assertJsonPath('data.rates.input', null);
    $this->deleteJson($url.'&group=tokens')->assertOk()->assertJsonPath('data.rates.input', 2)
        ->assertJsonPath('data.reranking.rates.search_unit', 0.1);
});

it('validates reranking decimals and selected basis without rounding or modifying prices', function (mixed $group) {
    $this->putJson('/trail/api/prices?provider=cohere&model=rank', ['reranking' => $group])->assertUnprocessable();
    expect(app(PriceBook::class)->resolveReranking('cohere', 'rank')->rate->rerankingSearchUnit)->toBe(0.1);
})->with([
    'list' => [[]], 'wrong basis' => [['basis' => 'both']], 'negative' => [['input' => -1]],
    'too precise' => [['search_unit' => '0.0000001']], 'too large' => [['input' => '1000000']], 'unknown field' => [['output' => 1]],
]);

it('preserves the legacy token save time during sibling saves and resets', function () {
    $old = '2026-01-01 10:00:00.123';
    Rows::price(['provider' => 'cohere', 'model' => 'rank', 'input' => 1, 'updated_at' => $old]);
    $url = '/trail/api/prices?provider=cohere&model=rank';
    $this->putJson($url, ['reranking' => ['basis' => 'search_units', 'search_unit' => '0.01']])->assertOk()
        ->assertJsonPath('data.saved_at', '2026-01-01T10:00:00.123Z');
    $this->deleteJson($url.'&group=reranking')->assertOk()->assertJsonPath('data.saved_at', '2026-01-01T10:00:00.123Z');
});
