<?php

namespace Astro\Trail\Tests\Fixtures\Sdk;

use function Orchestra\Testbench\default_migration_path;

/**
 * Creates Laravel's own tables, among them users, before the test database is refreshed, for the
 * same reason as MigratesSdkTables.
 */
trait MigratesLaravelTables
{
    protected function defineDatabaseMigrations(): void
    {
        // Registered on the migrator, like the SDK's, so a refresh that rebuilds the schema keeps them.
        $this->loadMigrationsFrom(default_migration_path());
    }
}
