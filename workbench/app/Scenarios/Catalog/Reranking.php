<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeCohere;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Reranking as Ranker;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Scenario;

class Reranking extends Scenario
{
    protected string $title = 'Reranking';

    protected string $description = 'Cohere search units and Voyage/Jina tokens produce estimates from the shipped price catalogue, with original indexes and provider order.';

    public function supportsLive(): bool
    {
        return false;
    }

    public function run(Backend $backend): void
    {
        $backend->reranking([FakeCohere::response([
            'results' => [['index' => 2, 'relevance_score' => 0.92], ['index' => 0, 'relevance_score' => 0.34]],
            'meta' => ['billed_units' => ['search_units' => 0.100001]],
        ])]);
        $documents = ['Shipping times', 'Payment methods', 'Returns and exchanges'];
        $results = [['index' => 2, 'relevance_score' => 0.92], ['index' => 0, 'relevance_score' => 0.34]];
        Ranker::of($documents)->limit(2)->rerank('Return a worn jacket', 'cohere', 'rerank-v4.0-pro');

        config(['ai.providers.voyageai.key' => Backend::PLACEHOLDER_KEY, 'ai.providers.jina.key' => Backend::PLACEHOLDER_KEY]);
        Http::fake([
            'api.voyageai.com/*' => Http::response(['data' => $results, 'usage' => ['total_tokens' => 240]]),
            'api.jina.ai/*' => Http::response(['results' => $results, 'usage' => ['total_tokens' => 320]]),
        ]);
        Ranker::of($documents)->limit(2)->rerank('Return a worn jacket', 'voyageai', 'rerank-3');
        Ranker::of($documents)->limit(2)->rerank('Return a worn jacket', 'jina', 'jina-reranker-v3.5');
    }
}
