<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\AccountAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Customers;

class Conversation extends Base
{
    public function key(): string
    {
        return 'conversation';
    }

    public function title(): string
    {
        return 'A remembered conversation';
    }

    public function description(): string
    {
        return 'A customer asks about an order and follows up; both runs belong to one stored conversation.';
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_01order', 'name' => 'lookup_order', 'input' => ['order_number' => 'NW-10482']]],
                ['input_tokens' => 502, 'output_tokens' => 40],
            ),
            FakeAnthropic::text(
                'Order NW-10482 has shipped and contains an Alpine 40L backpack and two pairs of trail socks.',
                ['input_tokens' => 655, 'output_tokens' => 58],
            ),
            FakeAnthropic::text(
                'The order total was $142.50.',
                ['input_tokens' => 731, 'output_tokens' => 14],
            ),
        ]);

        $customer = Customers::priya();

        $first = (new AccountAssistant)->forUser($customer)->prompt('Hi, what is in my order NW-10482?');

        (new AccountAssistant)->continue($first->conversationId, as: $customer)->prompt('And what did it come to?');
    }
}
