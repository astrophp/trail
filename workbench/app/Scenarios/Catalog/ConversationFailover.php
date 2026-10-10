<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Workbench\App\Agents\AccountAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Customers;
use Workbench\App\Scenarios\Scenario;

class ConversationFailover extends Scenario
{
    protected string $title = 'A conversation turn that fails over';

    protected string $description = 'The second turn of a conversation meets an overloaded provider and is answered by the backup provider.';

    public function supportsLive(): bool
    {
        return false;
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::text(
                'Hello Priya. How can I help?',
                ['input_tokens' => 298, 'output_tokens' => 14],
            ),
            FakeAnthropic::error(529, 'Overloaded', 'overloaded_error'),
            FakeAnthropic::text(
                'Standard shipping inside the US takes 3 to 5 business days.',
                ['input_tokens' => 352, 'output_tokens' => 29],
            ),
        ]);

        $customer = Customers::priya();
        $providers = ['anthropic' => 'claude-sonnet-5-5', 'backup' => 'claude-sonnet-5-5'];

        $first = (new AccountAssistant)->forUser($customer)->prompt('Hello!', provider: $providers);

        (new AccountAssistant)->continue($first->conversationId, as: $customer)->prompt('How long does standard shipping take?', provider: $providers);
    }
}
