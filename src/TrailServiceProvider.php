<?php

namespace Astro\Trail;

use Illuminate\Support\ServiceProvider;

class TrailServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/trail.php', 'trail');
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/../database/migrations');
    }
}
