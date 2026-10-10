<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\ConversationResource;
use Astro\Trail\Queries\ConversationFilters;
use Astro\Trail\Queries\ConversationIndex;
use Astro\Trail\Queries\Conversations;
use Astro\Trail\Queries\Page;
use Astro\Trail\Queries\TimeRange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ConversationIndexController
{
    public function __invoke(Request $request, ConversationIndex $index, Conversations $conversations): JsonResponse
    {
        $range = TimeRange::fromRequest($request);
        $filters = ConversationFilters::fromRequest($request);
        $page = Page::fromRequest($request);

        $counts = $index->counts($range, $filters);
        $summaries = $conversations->summaries($index->ids($range, $filters, $page));

        return response()->json([
            'data' => ConversationResource::of($summaries)->collection($summaries),
            'pagination' => $page->envelope($filters->failed ? $counts['failed'] : $counts['all']),
            'range' => $range->toArray(),
            'counts' => $counts,
        ]);
    }
}
