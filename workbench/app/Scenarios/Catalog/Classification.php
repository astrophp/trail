<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeDecisions;
use Laravel\Ai\Classification as Classifier;
use Laravel\Ai\Classification\Boolean;
use Laravel\Ai\Classification\Choice;
use Laravel\Ai\Classification\Score;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Scenario;

class Classification extends Scenario
{
    protected string $title = 'Classification';

    protected string $description = 'Boolean, choice and ordinal answers through the real SDK HTTP gateway, with measured token usage.';

    public function supportsLive(): bool
    {
        return false;
    }

    public function run(Backend $backend): void
    {
        $backend->decisions([FakeDecisions::response([
            'answers' => ['returns' => ['type' => 'noul', 'noul' => 0.85], 'category' => ['type' => 'choice', 'choice' => 'returns', 'probabilities' => ['returns' => 0.8, 'shipping' => 0.2]], 'urgency' => ['type' => 'score', 'score' => 0.75, 'confidence' => 0.6]],
            'usage' => ['input_tokens' => 38, 'output_tokens' => 12],
        ])]);
        Classifier::of('Can I return a jacket I wore once?')->questions([
            'returns' => new Boolean('Is this a returns question?'),
            'category' => new Choice('Support category?', ['returns' => 'Returns', 'shipping' => 'Shipping']),
            'urgency' => new Score('Urgency?', ['low', 'high']),
        ])->classify('typesafe', 'workbench-decisions');
    }
}
