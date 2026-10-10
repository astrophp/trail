<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\AttentionResource;
use Astro\Trail\Queries\AttentionQuery;
use Astro\Trail\Queries\RunScope;
use Astro\Trail\Queries\TimeRange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AttentionController
{
    public function __invoke(Request $request, AttentionQuery $query): JsonResponse
    {
        $range = TimeRange::fromRequest($request);

        return response()->json([
            'data' => AttentionResource::of($query->read($range, RunScope::none())),
            'range' => $range->toArray(),
        ]);
    }
}
