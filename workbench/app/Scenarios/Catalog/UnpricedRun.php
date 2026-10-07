<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\LocalPolicyResearcher;
use Workbench\App\Agents\SupportAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Scenario;

class UnpricedRun extends Scenario
{
    protected string $title = 'An unpriced run';

    protected string $description = 'The assistant answers on a local model that has no price, so the run reports tokens but no cost.';

    public function supportsLive(): bool
    {
        return false;
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::text(
                'Gift cards never expire and can be used on any order, online or in store.',
                ['input_tokens' => 391, 'output_tokens' => 33],
            ),
        ]);

        (new SupportAssistant)->prompt('Do your gift cards expire?', model: LocalPolicyResearcher::MODEL);
    }
}
