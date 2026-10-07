<?php

namespace Workbench\App\Providers;

use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Laravel\Ai\AiServiceProvider;
use ReflectionClass;
use Workbench\App\Console\RunScenarioCommand;

use function Orchestra\Testbench\workbench_path;

/**
 * Wires the workbench into whichever application boots it: the Testbench skeleton behind
 * `composer serve`, or a test application.
 */
class WorkbenchServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        if (blank(config('app.key'))) {
            config(['app.key' => $this->localKey()]);
        }

        // The skeleton lives in vendor/, so without this the database would too. A DB_DATABASE of its own wins,
        // and a test run never gets the file: refreshing the database there would wipe what was recorded.
        if (! $this->app->runningUnitTests() && env('DB_DATABASE') === null && env('DB_CONNECTION', 'sqlite') === 'sqlite') {
            $this->app->useDatabasePath(workbench_path('database'));

            // Testbench falls back to an in-memory database while the skeleton's own file is missing.
            config([
                'database.default' => 'sqlite',
                'database.connections.sqlite.database' => workbench_path('database', 'database.sqlite'),
            ]);
        }
    }

    /**
     * The key sessions and cookies are encrypted with when none is configured: stable for a checkout so
     * that a form posted by one request is accepted by the next, and meaningless anywhere else.
     */
    private function localKey(): string
    {
        return 'base64:'.base64_encode(hash('sha256', 'trail-workbench:'.workbench_path(), true));
    }

    public function boot(): void
    {
        // Conversations are stored in the SDK's own tables, which the SDK does not load by itself.
        $this->loadMigrationsFrom(dirname((new ReflectionClass(AiServiceProvider::class))->getFileName(), 2).'/database/migrations');
        $this->loadViewsFrom(workbench_path('resources', 'views'), 'workbench');

        Route::middleware('web')->group(workbench_path('routes', 'web.php'));

        if ($this->app->runningInConsole()) {
            $this->commands([RunScenarioCommand::class]);
        }
    }
}
