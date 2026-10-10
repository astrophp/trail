<?php

namespace Astro\Trail\Tests\Fixtures\Sdk;

use Laravel\Ai\AiServiceProvider;
use ReflectionClass;

/**
 * Creates the SDK's conversation tables before the test database is refreshed.
 *
 * Testbench calls defineDatabaseMigrations() while the application is being set up, ahead of
 * RefreshDatabase opening its transaction. Creating tables inside a test's transaction would be
 * DDL, which MySQL commits implicitly, ending the transaction and leaking the test's rows.
 */
trait MigratesSdkTables
{
    protected function defineDatabaseMigrations(): void
    {
        $this->loadMigrationsFrom(
            dirname((new ReflectionClass(AiServiceProvider::class))->getFileName(), 2).'/database/migrations'
        );
    }
}
