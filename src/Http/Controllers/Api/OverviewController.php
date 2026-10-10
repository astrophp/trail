<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\OverviewResource;
use Astro\Trail\Http\Resources\Timestamp;
use Astro\Trail\Queries\OverviewQuery;
use Astro\Trail\Queries\RunScope;
use Astro\Trail\Queries\TimeRange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OverviewController
{
    public function __invoke(Request $request, OverviewQuery $query): JsonResponse
    {
        $range = TimeRange::fromRequest($request);
        $overview = $query->read($range, RunScope::none());

        return response()->json([
            'data' => OverviewResource::of($overview),
            'range' => $range->toArray(),
            'previous_range' => [
                'from' => Timestamp::format($overview->previousRange->from),
                'to' => Timestamp::format($overview->previousRange->to),
            ],
        ]);
    }
}
