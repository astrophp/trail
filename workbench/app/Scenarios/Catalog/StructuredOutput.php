<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\TicketTriage;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Scenario;

class StructuredOutput extends Scenario
{
    protected string $title = 'Structured output';

    protected string $description = 'The triage agent sorts a support message into a category, a priority and a summary.';

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::text(
                '{"category":"returns","priority":"urgent","summary":"The Ridgeline rain shell arrived with a torn zipper and needs replacing before Friday."}',
                ['input_tokens' => 296, 'output_tokens' => 52],
            ),
        ]);

        (new TicketTriage)->prompt('My Ridgeline rain shell arrived with a torn zipper and I need a replacement before my trip on Friday.');
    }
}
