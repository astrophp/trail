<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Laravel\Ai\Exceptions\RateLimitedException;
use Workbench\App\Agents\AccountAssistant;
use Workbench\App\Scenarios\Backend;
use Workbench\App\Scenarios\Customers;
use Workbench\App\Scenarios\Scenario;

class ConversationFailure extends Scenario
{
    protected string $title = 'A conversation turn that fails';

    protected string $description = 'The first turn of a conversation is answered; the second meets a rate limit with nothing to fail over to.';

    public function supportsLive(): bool
    {
        return false;
    }

    public function expectedFailure(): ?string
    {
        return RateLimitedException::class;
    }

    public function run(Backend $backend): void
    {
        $backend->script([
            FakeAnthropic::text(
                'Hello Marcus. How can I help?',
                ['input_tokens' => 296, 'output_tokens' => 14],
            ),
            FakeAnthropic::error(429, 'Number of request tokens has exceeded your per-minute rate limit.', 'rate_limit_error'),
        ]);

        $customer = Customers::marcus();

        $first = (new AccountAssistant)->forUser($customer)->prompt('Hello!');

        (new AccountAssistant)->continue($first->conversationId, as: $customer)->prompt('Where is my order NW-10533?');
    }
}
