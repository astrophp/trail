<?php

namespace Astro\Trail;

use Astro\Trail\Capture\FlushPoints;
use Astro\Trail\Capture\Listeners;
use Astro\Trail\Capture\Recorder;
use Astro\Trail\Console\ClearCommand;
use Astro\Trail\Console\InstallCommand;
use Astro\Trail\Console\PruneCommand;
use Astro\Trail\Console\SweepCommand;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Storage\DatabaseTraceStore;
use Illuminate\Contracts\Config\Repository;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Database\ConnectionResolverInterface;
use Illuminate\Support\ServiceProvider;

class TrailServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/trail.php', 'trail');

        $this->app->singleton(PriceBook::class, function (Application $app) {
            $connection = config('trail.storage.connection');

            return new PriceBook(
                $app->make(Repository::class),
                $app->make(ConnectionResolverInterface::class),
                is_string($connection) ? $connection : null,
            );
        });

        $this->app->singleton(CostCalculator::class);

        $this->app->singleton(Recorder::class, fn (Application $app) => new Recorder($app, $app->make(CostCalculator::class)));

        $this->app->singleton(Trail::class, fn (Application $app) => new Trail($app));

        $this->app->singleton(TraceStore::class, function (Application $app) {
            $connection = config('trail.storage.connection');

            return new DatabaseTraceStore(
                $app->make(ConnectionResolverInterface::class),
                is_string($connection) ? $connection : null,
            );
        });
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/../database/migrations');

        if ($this->app->runningInConsole()) {
            $this->commands([
                InstallCommand::class,
                PruneCommand::class,
                SweepCommand::class,
                ClearCommand::class,
            ]);

            $this->publishes([__DIR__.'/../config/trail.php' => config_path('trail.php')], 'trail-config');
            $this->publishes([__DIR__.'/../stubs/TrailServiceProvider.stub' => app_path('Providers/TrailServiceProvider.php')], 'trail-provider');
        }

        if (config('trail.enabled')) {
            $events = $this->app->make(Dispatcher::class);

            Listeners::register($events, $this->app);
            FlushPoints::register($this->app, $events);
        }
    }
}
