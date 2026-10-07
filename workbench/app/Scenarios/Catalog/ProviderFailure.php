<?php

namespace Workbench\App\Scenarios\Catalog;

use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Laravel\Ai\Exceptions\RateLimitedException;
use Workbench\App\Agents\SupportAssistant;
use Workbench\App\Scenarios\Backend;

class ProviderFailure extends Base
{
    public function key(): string
    {
        return 'provider-failure';
    }

    public function title(): string
    {
        return 'A provider failure';
    }

    public function description(): string
    {
        return 'The provider answers 429 Too Many Requests and there is nothing to fail over to.';
    }

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
        $backend->script([FakeAnthropic::error(429, 'Number of request tokens has exceeded your per-minute rate limit.', 'rate_limit_error')]);

        (new SupportAssistant)->prompt('Do you ship the Alpine 40L backpack to Norway?');
    }
}
