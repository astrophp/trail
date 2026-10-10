<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\AgentResource;
use Astro\Trail\Http\Resources\ConversationResource;
use Astro\Trail\Http\Resources\TraceResource;
use Astro\Trail\Queries\Search;
use Astro\Trail\Queries\SearchTerm;
use Astro\Trail\Queries\TimeRange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SearchController
{
    public function __invoke(Request $request, Search $search): JsonResponse
    {
        $range = TimeRange::fromRequest($request);
        $term = SearchTerm::fromRequest($request);

        $found = $search->read($range, $term);

        $limit = fn (bool $truncated) => ['limit' => Search::LIMIT, 'truncated' => $truncated];

        return response()->json([
            'data' => [
                'traces' => TraceResource::of($found->traces)->collection($found->traces),
                'conversations' => ConversationResource::of($found->conversations)->collection($found->conversations),
                'agents' => array_map(AgentResource::of(...), $found->agents),
            ],
            'query' => ['q' => $term->text, 'minimum' => SearchTerm::MINIMUM, 'searched' => $term->searchable()],
            'limits' => [
                'traces' => $limit($found->tracesTruncated),
                'conversations' => $limit($found->conversationsTruncated),
                'agents' => $limit($found->agentsTruncated),
            ],
            'range' => $range->toArray(),
        ]);
    }
}
