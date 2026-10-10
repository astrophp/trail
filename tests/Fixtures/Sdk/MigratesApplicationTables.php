<?php

namespace Astro\Trail\Tests\Fixtures\Sdk;

/**
 * Creates the pretend application's tables before the test database is refreshed, for the same
 * reason as MigratesSdkTables: creating them inside a test's transaction is DDL, which MySQL commits.
 */
trait MigratesApplicationTables
{
    protected function defineDatabaseMigrations(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/../Capture/Hardening/migrations');
    }
}
