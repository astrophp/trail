<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\SupportAssistant;
use Workbench\App\Scenarios\Backend;

class PlainAnswer extends Base
{
    public function key(): string
    {
        return 'plain-answer';
    }

    public function title(): string
    {
        return 'Plain answer';
    }

    public function description(): string
    {
        return 'The support assistant answers a question in a single step, without tools.';
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::text(
                'Unworn boots can be returned within 30 days of delivery for a full refund. Use the returns form in your account to start.',
                ['input_tokens' => 412, 'output_tokens' => 38],
            ),
        ]);

        (new SupportAssistant)->prompt('What is your return window for unworn boots?');
    }
}
