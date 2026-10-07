<?php

namespace Astro\Trail\Tests\Fixtures\Workbench;

use Illuminate\Support\Facades\Http;
use Workbench\App\Providers\WorkbenchServiceProvider;

use function Orchestra\Testbench\default_migration_path;

/**
 * Boots the workbench app's provider on top of the package's own, with Laravel's tables (the
 * workbench's users live in one) and no provider key, so that every scenario runs offline.
 */
trait BootsWorkbench
{
    protected function getPackageProviders($app): array
    {
        return [...parent::getPackageProviders($app), WorkbenchServiceProvider::class];
    }

    protected function defineDatabaseMigrations(): void
    {
        $this->loadMigrationsFrom(default_migration_path());
    }

    protected function setUpBootsWorkbench(): void
    {
        // A key exported in the developer's shell must not turn these tests into live runs.
        config(['ai.providers.anthropic.key' => null, 'ai.providers.openai.key' => null]);

        Http::preventStrayRequests();
    }
}
