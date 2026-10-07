<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\SupportAssistant;
use Workbench\App\Scenarios\Backend;

class ToolCalls extends Base
{
    public function key(): string
    {
        return 'tool-calls';
    }

    public function title(): string
    {
        return 'Tool calls';
    }

    public function description(): string
    {
        return 'The assistant looks an order up with a tool, then answers from the result.';
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_01order', 'name' => 'lookup_order', 'input' => ['order_number' => 'NW-10482']]],
                ['input_tokens' => 538, 'output_tokens' => 46],
            ),
            FakeAnthropic::text(
                'Order NW-10482 has shipped: your Alpine 40L backpack and trail socks are on their way.',
                ['input_tokens' => 702, 'output_tokens' => 64],
            ),
        ]);

        (new SupportAssistant)->prompt('Where is my order NW-10482?');
    }
}
