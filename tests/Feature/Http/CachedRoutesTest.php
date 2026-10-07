<?php

use Astro\Trail\Tests\Fixtures\Http\HasCachedRoutes;
use Illuminate\Support\Facades\Route;

uses(HasCachedRoutes::class);

it('is booted as an application whose routes are cached', function () {
    expect($this->app->routesAreCached())->toBeTrue();
});

// ServiceProvider::loadRoutesFrom() skips a route file on a cached-routes application as well, so this
// cannot tell Trail's own check from the framework's; it pins the outcome, not which of the two did it.
it('registers no Trail route when the application reports cached routes', function () {
    expect(Route::has('trail.dashboard'))->toBeFalse()
        ->and(Route::has('trail.api.fallback'))->toBeFalse();
});
