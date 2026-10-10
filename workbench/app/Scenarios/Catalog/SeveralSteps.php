<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\SupportAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Scenario;

class SeveralSteps extends Scenario
{
    protected string $title = 'Several steps';

    protected string $description = 'One question takes three model steps: a stock check, an order lookup and the answer.';

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_01stock', 'name' => 'check_inventory', 'input' => ['product' => 'Ridgeline rain shell']]],
                ['input_tokens' => 604, 'output_tokens' => 41],
            ),
            FakeAnthropic::toolUse(
                [['id' => 'toolu_02order', 'name' => 'lookup_order', 'input' => ['order_number' => 'NW-10517']]],
                ['input_tokens' => 731, 'output_tokens' => 39],
            ),
            FakeAnthropic::text(
                'The Ridgeline rain shell is in stock (14 left), and order NW-10517 is still being processed.',
                ['input_tokens' => 902, 'output_tokens' => 88],
            ),
        ]);

        (new SupportAssistant)->prompt('Is the Ridgeline rain shell in stock, and what is the status of order NW-10517?');
    }
}
