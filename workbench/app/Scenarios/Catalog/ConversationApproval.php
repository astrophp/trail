<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Laravel\Ai\Approvals\Decisions;
use Workbench\App\Agents\AccountAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Customers;
use Workbench\App\Scenarios\Scenario;

class ConversationApproval extends Scenario
{
    protected string $title = 'A conversation that waits for approval';

    protected string $description = 'A refund pauses a turn until a person approves it; the approval resumes the conversation in a second run.';

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_01refund', 'name' => 'issue_refund', 'input' => ['order_number' => 'NW-10533', 'amount' => 96.0]]],
                ['input_tokens' => 573, 'output_tokens' => 61],
            ),
            FakeAnthropic::text(
                'The refund of $96.00 on order NW-10533 has been issued.',
                ['input_tokens' => 702, 'output_tokens' => 24],
            ),
        ]);

        $customer = Customers::marcus();

        $paused = (new AccountAssistant)->forUser($customer)->prompt('Please refund order NW-10533, the trekking poles arrived bent.');

        (new AccountAssistant)->continue($paused->conversationId, as: $customer)->prompt(Decisions::from(['toolu_01refund' => true]));
    }
}
