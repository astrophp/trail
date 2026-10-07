<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Laravel\Ai\Streaming\Events\TextDelta;
use Laravel\Ai\Streaming\Events\ToolResult;
use Workbench\App\Agents\SupportAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Scenario;

class AbandonedStream extends Scenario
{
    protected string $title = 'A run left running';

    protected string $description = 'A streamed answer is abandoned half way: it shows as running for a minute, then as incomplete.';

    public function supportsLive(): bool
    {
        return false;
    }

    public function leavesRunUnfinished(): bool
    {
        return true;
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_01order', 'name' => 'lookup_order', 'input' => ['order_number' => 'NW-10482']]],
                ['input_tokens' => 533, 'output_tokens' => 41],
            ),
            FakeAnthropic::text(
                'Order NW-10482 has shipped: your Alpine 40L backpack and trail socks are on their way.',
                ['input_tokens' => 702, 'output_tokens' => 58],
            ),
        ]);

        $toolRan = false;

        // The customer closes the page once the answer starts arriving, so the stream is never read to its end.
        foreach ((new SupportAssistant)->stream('Where is order NW-10482?') as $event) {
            $toolRan = $toolRan || $event instanceof ToolResult;

            if ($toolRan && $event instanceof TextDelta) {
                break;
            }
        }
    }
}
