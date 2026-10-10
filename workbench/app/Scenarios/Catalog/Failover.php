<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\SupportAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Scenario;

class Failover extends Scenario
{
    protected string $title = 'Failover that recovers';

    protected string $description = 'The first provider is overloaded, the backup provider answers, and the run completes.';

    public function supportsLive(): bool
    {
        return false;
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::error(529, 'Overloaded', 'overloaded_error'),
            FakeAnthropic::text(
                'Standard shipping inside the US takes 3 to 5 business days.',
                ['input_tokens' => 367, 'output_tokens' => 29],
            ),
        ]);

        (new SupportAssistant)->prompt(
            'How long does standard shipping take?',
            provider: ['anthropic' => 'claude-sonnet-5-5', 'backup' => 'claude-sonnet-5-5'],
        );
    }
}
