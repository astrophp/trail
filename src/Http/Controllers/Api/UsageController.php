<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\SummaryResource;
use Astro\Trail\Http\Resources\UsageResource;
use Astro\Trail\Queries\OverviewQuery;
use Astro\Trail\Queries\RunScope;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Queries\UsageQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UsageController
{
    public function __invoke(Request $request, OverviewQuery $overview, UsageQuery $usage): JsonResponse
    {
        $range = TimeRange::fromRequest($request);

        // The summary is read as the overview reads it, so that the two never differ.
        $summary = SummaryResource::of($overview->read($range, RunScope::none())->summary);

        return response()->json([
            'data' => UsageResource::totals($summary, $usage->coverage($range)),
            'range' => $range->toArray(),
        ]);
    }
}
