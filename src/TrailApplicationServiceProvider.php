<?php

namespace Astro\Trail;

use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class TrailApplicationServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        $this->gate();
    }

    /**
     * Define the viewTrail gate, which decides who can open the dashboard.
     * Nobody can until the application's own provider says otherwise.
     */
    protected function gate(): void
    {
        Gate::define('viewTrail', fn ($user = null) => false);
    }
}
