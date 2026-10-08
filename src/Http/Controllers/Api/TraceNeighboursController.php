<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Queries\ConversationTurns;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Queries\TraceFilters;
use Astro\Trail\Queries\TraceId;
use Astro\Trail\Queries\TraceIndex;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class TraceNeighboursController
{
    public function __invoke(string $id, Request $request, TraceIndex $index, ConversationTurns $turns): JsonResponse
    {
        // An id the column could not hold is no run, and is not sent to the database.
        abort_unless(TraceId::isPossible($id), 404);

        $within = Validator::make(array_filter($request->query(), fn (mixed $value) => $value !== '' && $value !== null), ['within' => ['string', 'in:conversation']])->validate();

        if (($within['within'] ?? null) === 'conversation') {
            // The conversation is whole: the range, the filters and the sort do not apply, and are not read.
            $neighbours = $turns->neighbours($id);
            abort_if($neighbours === null, 404);

            return response()->json(['data' => $neighbours]);
        }

        $range = TimeRange::fromRequest($request);
        $filters = TraceFilters::fromRequest($request);

        $threshold = $filters->slow ? $index->slowThreshold($range) : null;
        $neighbours = $index->neighbours($id, $range, $filters, $threshold);
        abort_if($neighbours === null, 404);

        return response()->json(['data' => $neighbours]);
    }
}
