<?php

use Astro\Trail\Tests\Fixtures\Sdk\FakeCohere;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Events\Reranked;
use Laravel\Ai\Events\Reranking as RerankingEvent;
use Laravel\Ai\Reranking;
use Laravel\Ai\Responses\Data\RankedDocument;
use Laravel\Ai\Responses\Data\RerankingUsage;

it('maps Cohere billed usage and preserves returned order and original indexes', function () {
    $fake = FakeCohere::script([FakeCohere::response([
        'results' => [['index' => 2, 'relevance_score' => 0.91], ['index' => 0, 'relevance_score' => 0.45]],
        'meta' => ['billed_units' => ['input_tokens' => 23, 'search_units' => 1.5]],
        'model' => 'ignored-model',
    ])]);

    $response = Reranking::of(['first', 'second', 'third'])->limit(2)->timeout(7)->rerank('query', 'cohere', 'requested-model');
    $start = $this->sdk->sole(RerankingEvent::class);
    $end = $this->sdk->sole(Reranked::class);

    expect($this->sdk->timeline())->toBe(['Reranking', 'Reranked'])
        ->and($start->invocationId)->toMatch('/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/')
        ->and($end->invocationId)->toBe($start->invocationId)
        ->and($end->event->prompt)->toBe($start->event->prompt)
        ->and($end->event->response)->toBe($response)
        ->and($start->parentInvocation)->toBe([null, null])
        ->and($end->parentInvocation)->toBe([null, null])
        ->and(property_exists($start->event->prompt, 'parentInvocationId'))->toBeFalse()
        ->and($start->event->prompt->documents)->toBe(['first', 'second', 'third'])
        ->and($start->event->prompt->query)->toBe('query')
        ->and($start->event->prompt->limit)->toBe(2)
        ->and($start->event->prompt->timeout)->toBe(7)
        ->and(array_map(fn ($result) => [$result->index, $result->score, $result->document], $response->results))->toBe([[2, 0.91, 'third'], [0, 0.45, 'first']])
        ->and($response->usage->toArray())->toBe(['input_tokens' => 23, 'output_tokens' => 0, 'search_units' => 1.5])
        ->and($response->meta->model)->toBe('requested-model')
        ->and($fake->requests)->toBe([['model' => 'requested-model', 'query' => 'query', 'documents' => ['first', 'second', 'third'], 'top_n' => 2]])
        ->and($fake->urls)->toBe(['https://api.cohere.com/v2/rerank'])
        ->and($fake->remaining())->toBe(0);
});

it('distinguishes absent search units from explicit zero while output zero is structural', function (array $units, ?float $expected) {
    FakeCohere::script([FakeCohere::response(['results' => [], 'meta' => ['billed_units' => $units]])]);

    $response = Reranking::of(['document'])->rerank('query');

    expect($response->usage->toArray())->toBe(['input_tokens' => 0, 'output_tokens' => 0, 'search_units' => $expected]);
})->with([
    'missing' => [[], null],
    'null' => [['search_units' => null], null],
    'explicit zero' => [['search_units' => 0.0], 0.0],
    'search units only' => [['search_units' => 2.5], 2.5],
]);

it('also emits the event pair for an SDK fake with unreported usage', function () {
    Reranking::fake([[new RankedDocument(1, 'second', 0.7), new RankedDocument(0, 'first', 0.3)]]);

    $response = Reranking::of(['first', 'second'])->rerank('query');

    expect($this->sdk->timeline())->toBe(['Reranking', 'Reranked'])
        ->and(array_map(fn ($result) => $result->index, $response->results))->toBe([1, 0])
        ->and($response->usage->toArray())->toBe((new RerankingUsage)->toArray());
    Http::assertNothingSent();
});
