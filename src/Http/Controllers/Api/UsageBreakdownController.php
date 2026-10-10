<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\UsageResource;
use Astro\Trail\Queries\Page;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Queries\UsageFilters;
use Astro\Trail\Queries\UsageQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UsageBreakdownController
{
    public function __invoke(Request $request, UsageQuery $usage): JsonResponse
    {
        $range = TimeRange::fromRequest($request);
        $filters = UsageFilters::fromRequest($request);
        $page = Page::fromRequest($request);

        return response()->json([
            ...UsageResource::breakdown($usage->list($range, $filters, $page), $page),
            'range' => $range->toArray(),
        ]);
    }
}
