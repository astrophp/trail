<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\AccountAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Customers;
use Workbench\App\Scenarios\Scenario;

class LongConversation extends Scenario
{
    protected string $title = 'A longer conversation';

    protected string $description = 'A customer talks to the assistant over four turns; one of them looks an order up with a tool.';

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::text(
                'Hello Priya. I can look up an order, or help with something else.',
                ['input_tokens' => 310, 'output_tokens' => 21],
            ),
            FakeAnthropic::toolUse(
                [['id' => 'toolu_01track', 'name' => 'lookup_order', 'input' => ['order_number' => 'NW-10517']]],
                ['input_tokens' => 389, 'output_tokens' => 38],
            ),
            FakeAnthropic::text(
                'Order NW-10517 is still being processed. It holds one Ridgeline rain shell.',
                ['input_tokens' => 512, 'output_tokens' => 31],
            ),
            FakeAnthropic::text(
                'Orders usually leave the warehouse within two business days.',
                ['input_tokens' => 561, 'output_tokens' => 19],
            ),
            FakeAnthropic::text(
                'You are welcome. Come back any time.',
                ['input_tokens' => 596, 'output_tokens' => 12],
            ),
        ]);

        $customer = Customers::priya();

        $first = (new AccountAssistant)->forUser($customer)->prompt('Hi, I have a question about an order.');

        foreach ([
            'Where is order NW-10517?',
            'How long until it ships?',
            'Thanks, that is all.',
        ] as $message) {
            (new AccountAssistant)->continue($first->conversationId, as: $customer)->prompt($message);
        }
    }
}
