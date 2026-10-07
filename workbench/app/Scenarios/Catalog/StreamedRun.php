<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\SupportAssistant;
use Workbench\App\Scenarios\Backend;

class StreamedRun extends Base
{
    public function key(): string
    {
        return 'streamed-run';
    }

    public function title(): string
    {
        return 'A streamed run';
    }

    public function description(): string
    {
        return 'The assistant looks an order up and streams its answer back as it is written.';
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_01order', 'name' => 'lookup_order', 'input' => ['order_number' => 'NW-10533']]],
                ['input_tokens' => 549, 'output_tokens' => 43],
            ),
            FakeAnthropic::text(
                'Order NW-10533 was delivered: your Summit trekking poles should be at your door.',
                ['input_tokens' => 688, 'output_tokens' => 57],
            ),
        ]);

        // Consuming the stream is what runs the agent.
        foreach ((new SupportAssistant)->stream('Has order NW-10533 arrived?') as $event) {
            // Nothing to do with each event here.
        }
    }
}
