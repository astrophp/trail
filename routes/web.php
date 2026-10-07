<?php

use Astro\Trail\Http\Controllers\ApiNotFoundController;
use Astro\Trail\Http\Controllers\DashboardController;
use Illuminate\Support\Facades\Route;

// Every API endpoint is registered above this line. It keeps the whole /api space out of the
// dashboard page, so an unknown API path answers a JSON 404 rather than HTML.
Route::any('api/{path?}', ApiNotFoundController::class)->where('path', '.*')->name('trail.api.fallback');

Route::get('/{view?}', DashboardController::class)->where('view', '.*')->name('trail.dashboard');
