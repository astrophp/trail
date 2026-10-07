<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\Coverage;
use Astro\Trail\Http\Resources\SpanResource;
use Astro\Trail\Http\Resources\TraceDetailResource;
use Astro\Trail\Http\Resources\TraceResource;
use Astro\Trail\Http\Resources\UsageBreakdown;
use Astro\Trail\Queries\TraceDetail;
use Astro\Trail\Queries\TraceId;
use Illuminate\Http\JsonResponse;

class TraceShowController
{
    public function __invoke(string $id, TraceDetail $detail): JsonResponse
    {
        // An id the column could not hold is no run, and is not sent to the database.
        abort_unless(TraceId::isPossible($id), 404);

        $trace = $detail->find($id);
        abort_if($trace === null, 404);

        $page = $detail->spans($trace);
        $run = TraceResource::of([$trace])->toArray($trace);

        return response()->json([
            'data' => [
                'trace' => $run,
                'detail' => TraceDetailResource::of($trace),
                'spans' => (new SpanResource($trace->started_at))->collection($page['spans']),
                'usage' => UsageBreakdown::of($page['spans'], $run),
                'coverage' => Coverage::of($trace, $page['spans']),
            ],
            'span_limit' => ['limit' => TraceDetail::SPAN_LIMIT, 'total' => $page['total'], 'truncated' => $page['truncated']],
        ]);
    }
}
