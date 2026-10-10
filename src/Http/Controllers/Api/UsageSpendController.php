<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\SpendResource;
use Astro\Trail\Queries\SpendQuery;
use Astro\Trail\Queries\TimeRange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UsageSpendController
{
    public function __invoke(Request $request, SpendQuery $spend): JsonResponse
    {
        $range = TimeRange::fromRequest($request);

        return response()->json([
            'data' => SpendResource::of($spend->read($range)),
            'range' => $range->toArray(),
        ]);
    }
}
