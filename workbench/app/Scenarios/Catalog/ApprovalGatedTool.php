<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\AccountAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Customers;

class ApprovalGatedTool extends Base
{
    public function key(): string
    {
        return 'approval-gated-tool';
    }

    public function title(): string
    {
        return 'An approval-gated tool';
    }

    public function description(): string
    {
        return 'The assistant asks for a refund, which needs a person to approve it, so the run pauses.';
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_01refund', 'name' => 'issue_refund', 'input' => ['order_number' => 'NW-10533', 'amount' => 96.0]]],
                ['input_tokens' => 573, 'output_tokens' => 61],
            ),
        ]);

        (new AccountAssistant)->forUser(Customers::marcus())->prompt('Please refund order NW-10533, the trekking poles arrived bent.');
    }
}
