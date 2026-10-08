<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Queries\TraceFilters;
use Astro\Trail\Queries\TraceId;
use Astro\Trail\Queries\TraceIndex;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TraceNeighboursController
{
    public function __invoke(string $id, Request $request, TraceIndex $index): JsonResponse
    {
        // An id the column could not hold is no run, and is not sent to the database.
        abort_unless(TraceId::isPossible($id), 404);

        $range = TimeRange::fromRequest($request);
        $filters = TraceFilters::fromRequest($request);

        $threshold = $filters->slow ? $index->slowThreshold($range) : null;
        $neighbours = $index->neighbours($id, $range, $filters, $threshold);
        abort_if($neighbours === null, 404);

        return response()->json(['data' => $neighbours]);
    }
}
