<?php

namespace Astro\Trail\Tests\Fixtures\Sdk;

use Laravel\Ai\AiServiceProvider;
use ReflectionClass;

use function Orchestra\Testbench\default_migration_path;

/**
 * Creates Laravel's own tables and the SDK's conversation tables before the test database is
 * refreshed, for tests that record real runs and read them through the API.
 */
trait MigratesLaravelAndSdkTables
{
    protected function defineDatabaseMigrations(): void
    {
        $this->loadMigrationsFrom(default_migration_path());
        $this->loadMigrationsFrom(
            dirname((new ReflectionClass(AiServiceProvider::class))->getFileName(), 2).'/database/migrations'
        );
    }
}
