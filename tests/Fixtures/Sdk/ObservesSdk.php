<?php

namespace Astro\Trail\Tests\Fixtures\Sdk;

use Illuminate\Support\Facades\Http;
use Laravel\Ai\AiServiceProvider;
use ReflectionClass;

/**
 * Test setup shared by the SDK behaviour tests: two configured providers with placeholder keys,
 * no stray HTTP, and an event log recording from the first line of the test.
 */
trait ObservesSdk
{
    protected EventLog $sdk;

    protected function setUpObservesSdk(): void
    {
        config([
            'ai.default' => 'anthropic',
            'ai.default_for_embeddings' => 'openai',
            'ai.providers.anthropic.key' => 'test-key',
            'ai.providers.openai.key' => 'test-key',
            'ai.providers.backup' => ['driver' => 'anthropic', 'key' => 'test-key', 'url' => 'https://backup.anthropic.test/v1'],
            'ai.conversations.generate_title' => false,
        ]);

        Http::preventStrayRequests();

        $this->sdk = EventLog::start();
    }

    /**
     * Create the SDK's conversation tables for tests that remember conversations.
     */
    protected function migrateSdkTables(): void
    {
        $this->loadMigrationsFrom(
            dirname((new ReflectionClass(AiServiceProvider::class))->getFileName(), 2).'/database/migrations'
        );
    }
}
