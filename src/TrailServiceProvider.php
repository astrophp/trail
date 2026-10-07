<?php

namespace Astro\Trail;

use Astro\Trail\Capture\FlushPoints;
use Astro\Trail\Capture\Listeners;
use Astro\Trail\Capture\Recorder;
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

        if (config('trail.enabled')) {
            $events = $this->app->make(Dispatcher::class);

            Listeners::register($events, $this->app);
            FlushPoints::register($this->app, $events);
        }
    }
}
