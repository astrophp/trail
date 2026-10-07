<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\PolicyResearcher;
use Workbench\App\Agents\SupportAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Scenario;

class FailingSubAgent extends Scenario
{
    protected string $title = 'A failing sub-agent';

    protected string $description = 'The policy researcher fails with a server error; the assistant carries on and still answers.';

    public function supportsLive(): bool
    {
        return false;
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_01policy', 'name' => 'PolicyResearcher', 'input' => ['task' => 'What is the shipping time to Canada?']]],
                ['input_tokens' => 466, 'output_tokens' => 49],
            ),
            FakeAnthropic::error(500, 'Internal server error.'),
            FakeAnthropic::text(
                'I could not check the shipping policy just now. Orders to Canada usually take 5 to 8 business days.',
                ['input_tokens' => 598, 'output_tokens' => 83],
            ),
        ]);

        (new SupportAssistant([new PolicyResearcher]))->prompt('How long does shipping to Canada take?');
    }
}
