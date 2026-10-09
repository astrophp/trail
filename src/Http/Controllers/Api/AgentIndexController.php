<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\AgentResource;
use Astro\Trail\Http\Resources\Timestamp;
use Astro\Trail\Queries\AgentFilters;
use Astro\Trail\Queries\AgentIndex;
use Astro\Trail\Queries\Page;
use Astro\Trail\Queries\TimeRange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AgentIndexController
{
    public function __invoke(Request $request, AgentIndex $index): JsonResponse
    {
        $range = TimeRange::fromRequest($request);
        $filters = AgentFilters::fromRequest($request);
        $page = Page::fromRequest($request);

        $listing = $index->list($range, $filters, $page);

        return response()->json([
            'data' => array_map(AgentResource::of(...), $listing->agents),
            'pagination' => $page->envelope($listing->total),
            'range' => $range->toArray(),
            'buckets' => [
                'bucket' => $listing->unit->value,
                'edges' => array_map(fn (array $bucket) => [
                    'from' => Timestamp::format($bucket['from']),
                    'to' => Timestamp::format($bucket['to']),
                    'full' => $bucket['full'],
                    'in_progress' => $bucket['inProgress'],
                ], $listing->buckets),
            ],
            'agent_limit' => ['limit' => $listing->limit, 'truncated' => $listing->truncated],
        ]);
    }
}
