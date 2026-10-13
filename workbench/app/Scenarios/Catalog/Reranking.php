<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeCohere;
use Laravel\Ai\Reranking as Ranker;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Scenario;

class Reranking extends Scenario
{
    protected string $title = 'Reranking';

    protected string $description = 'A standalone reranking call preserves document indexes, provider order and fractional billed search units.';

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
        Ranker::of(['Shipping times', 'Payment methods', 'Returns and exchanges'])->limit(2)->rerank('Return a worn jacket', 'cohere', 'workbench-rerank');
    }
}
