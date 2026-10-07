<?php

use Astro\Trail\Http\Controllers\DashboardController;
use Astro\Trail\Http\Middleware\Authorize;
use Illuminate\Support\Facades\Route;

Route::middleware(Authorize::class)->group(function () {
    // Every API endpoint is registered above this line. It keeps the whole /api space out of the
    // dashboard page, so an unknown API path answers a 404 rather than the page.
    Route::any('api/{path?}', fn () => abort(404))->where('path', '.*')->name('trail.api.fallback');

    Route::get('/{view?}', DashboardController::class)->where('view', '.*')->name('trail.dashboard');
});
