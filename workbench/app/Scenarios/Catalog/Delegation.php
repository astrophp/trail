<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\PolicyResearcher;
use Workbench\App\Agents\SupportAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Scenario;

class Delegation extends Scenario
{
    protected string $title = 'Delegation to a sub-agent';

    protected string $description = 'The assistant hands a policy question to the policy researcher, which answers on its own.';

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_01policy', 'name' => 'PolicyResearcher', 'input' => ['task' => 'What is the warranty period on trekking poles?']]],
                ['input_tokens' => 480, 'output_tokens' => 52],
            ),
            FakeAnthropic::text(
                'Trekking poles carry a two-year warranty against manufacturing defects.',
                ['input_tokens' => 215, 'output_tokens' => 47],
            ),
            FakeAnthropic::text(
                'Our trekking poles come with a two-year warranty against manufacturing defects.',
                ['input_tokens' => 640, 'output_tokens' => 71],
            ),
        ]);

        (new SupportAssistant([new PolicyResearcher]))->prompt('How long is the warranty on trekking poles?');
    }
}
