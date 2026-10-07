<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\TraceResource;
use Astro\Trail\Queries\Page;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Queries\TraceFilters;
use Astro\Trail\Queries\TraceIndex;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TraceIndexController
{
    public function __invoke(Request $request, TraceIndex $index): JsonResponse
    {
        $range = TimeRange::fromRequest($request);
        $filters = TraceFilters::fromRequest($request);
        $page = Page::fromRequest($request);

        $threshold = $filters->slow ? $index->slowThreshold($range) : null;
        $counts = $index->statusCounts($range, $filters, $threshold);
        $traces = $index->rows($range, $filters, $threshold, $page);

        return response()->json([
            'data' => TraceResource::of($traces)->collection($traces),
            'pagination' => $page->envelope($counts[$filters->status->value ?? 'all']),
            'range' => $range->toArray(),
            'status_counts' => $counts,
            'slow_threshold_ms' => $threshold,
        ]);
    }
}
