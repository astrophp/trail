<?php

use Astro\Trail\Http\Controllers\Api\MetaController;
use Astro\Trail\Http\Controllers\DashboardController;
use Astro\Trail\Http\Middleware\Authorize;
use Astro\Trail\Http\Middleware\RespondWithJson;
use Illuminate\Support\Facades\Route;

// RespondWithJson comes first, so the access check's own 403 and 404 are JSON as well.
Route::prefix('api')->middleware([RespondWithJson::class, Authorize::class])->group(function () {
    Route::get('meta', MetaController::class)->name('trail.api.meta');

    // Every API endpoint is registered above this line. It keeps the whole /api space out of the
    // dashboard page, so an unknown API path answers a 404 rather than the page.
    Route::any('{path?}', fn () => abort(404))->where('path', '.*')->name('trail.api.fallback');
});

Route::middleware(Authorize::class)->group(function () {
    Route::get('/{view?}', DashboardController::class)->where('view', '.*')->name('trail.dashboard');
});
