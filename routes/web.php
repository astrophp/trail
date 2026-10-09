<?php

use Astro\Trail\Http\Controllers\Api\AgentBreakdownController;
use Astro\Trail\Http\Controllers\Api\AgentIndexController;
use Astro\Trail\Http\Controllers\Api\AgentShowController;
use Astro\Trail\Http\Controllers\Api\AttentionController;
use Astro\Trail\Http\Controllers\Api\ConversationIndexController;
use Astro\Trail\Http\Controllers\Api\ConversationTranscriptController;
use Astro\Trail\Http\Controllers\Api\MetaController;
use Astro\Trail\Http\Controllers\Api\OverviewController;
use Astro\Trail\Http\Controllers\Api\PriceController;
use Astro\Trail\Http\Controllers\Api\PriceIndexController;
use Astro\Trail\Http\Controllers\Api\TraceBookmarkController;
use Astro\Trail\Http\Controllers\Api\TraceExportController;
use Astro\Trail\Http\Controllers\Api\TraceIndexController;
use Astro\Trail\Http\Controllers\Api\TraceNeighboursController;
use Astro\Trail\Http\Controllers\Api\TraceShowController;
use Astro\Trail\Http\Controllers\Api\UsageBreakdownController;
use Astro\Trail\Http\Controllers\Api\UsageController;
use Astro\Trail\Http\Controllers\Api\UsageExportController;
use Astro\Trail\Http\Controllers\Api\UsageSpendController;
use Astro\Trail\Http\Controllers\Api\UsageSpendExportController;
use Astro\Trail\Http\Controllers\DashboardController;
use Astro\Trail\Http\Middleware\Authorize;
use Astro\Trail\Http\Middleware\RespondWithJson;
use Illuminate\Support\Facades\Route;

// RespondWithJson comes first, so the access check's own 403 and 404 are JSON as well.
Route::prefix('api')->middleware([RespondWithJson::class, Authorize::class])->group(function () {
    Route::get('meta', MetaController::class)->name('trail.api.meta');
    Route::get('overview', OverviewController::class)->name('trail.api.overview');
    // Its own path, not a segment of the overview's: a route under "overview" never shadows it.
    Route::get('overview/attention', AttentionController::class)->name('trail.api.overview.attention');
    Route::get('agents', AgentIndexController::class)->name('trail.api.agents.index');
    // The agent's name travels in the query: it can hold any character, a slash among them.
    Route::get('agents/show', AgentShowController::class)->name('trail.api.agents.show');
    Route::get('agents/breakdown', AgentBreakdownController::class)->name('trail.api.agents.breakdown');
    Route::get('conversations', ConversationIndexController::class)->name('trail.api.conversations.index');
    // The conversation's id travels in the query: it can hold any character, a slash among them.
    Route::get('conversations/transcript', ConversationTranscriptController::class)->name('trail.api.conversations.transcript');
    Route::get('traces', TraceIndexController::class)->name('trail.api.traces.index');
    // Above the detail route, or "export" would be read as a run's id.
    Route::get('traces/export', TraceExportController::class)->name('trail.api.traces.export');
    Route::get('traces/{id}', TraceShowController::class)->name('trail.api.traces.show');
    Route::get('traces/{id}/neighbours', TraceNeighboursController::class)->name('trail.api.traces.neighbours');
    Route::put('traces/{id}/bookmark', [TraceBookmarkController::class, 'store'])->name('trail.api.traces.bookmark.store');
    Route::delete('traces/{id}/bookmark', [TraceBookmarkController::class, 'destroy'])->name('trail.api.traces.bookmark.destroy');

    Route::get('usage', UsageController::class)->name('trail.api.usage');
    Route::get('usage/breakdown', UsageBreakdownController::class)->name('trail.api.usage.breakdown');
    Route::get('usage/spend', UsageSpendController::class)->name('trail.api.usage.spend');
    // Paths of their own, none a placeholder: no route here can read "export" as something else.
    Route::get('usage/export', UsageExportController::class)->name('trail.api.usage.export');
    Route::get('usage/spend/export', UsageSpendExportController::class)->name('trail.api.usage.spend.export');

    // The model travels in the query: its id can hold any character, a slash among them.
    Route::get('prices', PriceIndexController::class)->name('trail.api.prices.index');
    Route::put('prices', [PriceController::class, 'update'])->name('trail.api.prices.update');
    Route::delete('prices', [PriceController::class, 'destroy'])->name('trail.api.prices.destroy');

    // Every API endpoint is registered above this line. It keeps the whole /api space out of the
    // dashboard page, so an unknown API path answers a 404 rather than the page.
    Route::any('{path?}', fn () => abort(404))->where('path', '.*')->name('trail.api.fallback');
});

Route::middleware(Authorize::class)->group(function () {
    Route::get('/{view?}', DashboardController::class)->where('view', '.*')->name('trail.dashboard');
});
