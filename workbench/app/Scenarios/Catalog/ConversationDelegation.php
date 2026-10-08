<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\AccountAssistant;
use Workbench\App\Agents\PolicyResearcher;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Customers;
use Workbench\App\Scenarios\Scenario;
use Workbench\App\Tools\LookupOrder;

class ConversationDelegation extends Scenario
{
    protected string $title = 'A conversation turn that delegates';

    protected string $description = 'In the second turn of a conversation the assistant hands a policy question to the policy researcher.';

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::text(
                'Hello Priya. How can I help?',
                ['input_tokens' => 301, 'output_tokens' => 14],
            ),
            FakeAnthropic::toolUse(
                [['id' => 'toolu_01policy', 'name' => 'PolicyResearcher', 'input' => ['task' => 'What is the return window for a rain shell?']]],
                ['input_tokens' => 366, 'output_tokens' => 49],
            ),
            FakeAnthropic::text(
                'Unworn rain shells can be returned within 30 days of delivery.',
                ['input_tokens' => 209, 'output_tokens' => 36],
            ),
            FakeAnthropic::text(
                'You can return the rain shell within 30 days of delivery, as long as it is unworn.',
                ['input_tokens' => 501, 'output_tokens' => 44],
            ),
        ]);

        $customer = Customers::priya();
        $tools = [new LookupOrder, new PolicyResearcher];

        $first = (new AccountAssistant($tools))->forUser($customer)->prompt('Hello!');

        (new AccountAssistant($tools))->continue($first->conversationId, as: $customer)->prompt('How long do I have to return a rain shell?');
    }
}
