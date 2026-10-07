<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\LocalPolicyResearcher;
use Workbench\App\Agents\SupportAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Scenario;

class PartlyPricedRun extends Scenario
{
    protected string $title = 'A partly priced run';

    protected string $description = 'The assistant hands a question to a policy researcher on a local model with no price, so only part of the run has a cost.';

    public function supportsLive(): bool
    {
        return false;
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_01policy', 'name' => 'LocalPolicyResearcher', 'input' => ['task' => 'Can a worn rain shell be returned?']]],
                ['input_tokens' => 502, 'output_tokens' => 47],
            ),
            FakeAnthropic::text(
                'Worn items can be returned within 30 days if the fault is a defect; otherwise they must be unworn.',
                ['input_tokens' => 233, 'output_tokens' => 41],
            ),
            FakeAnthropic::text(
                'A worn rain shell can only be returned if it has a defect. If yours does, start a return within 30 days of delivery.',
                ['input_tokens' => 655, 'output_tokens' => 69],
            ),
        ]);

        (new SupportAssistant([new LocalPolicyResearcher]))->prompt('Can I return a rain shell I have already worn?');
    }
}
