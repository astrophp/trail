<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\AgentBreakdownResource;
use Astro\Trail\Queries\AgentBreakdown;
use Astro\Trail\Queries\AgentLookup;
use Astro\Trail\Queries\AgentName;
use Astro\Trail\Queries\RawQuery;
use Astro\Trail\Queries\TimeRange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AgentBreakdownController
{
    public function __invoke(Request $request, AgentLookup $lookup, AgentBreakdown $breakdown): JsonResponse
    {
        // A name the column could not hold is no agent, and is not sent to the database.
        $name = RawQuery::string($request, 'name');
        abort_unless($name !== null && AgentName::isPossible($name), 404);

        $range = TimeRange::fromRequest($request);

        $identity = $lookup->inRange($name, $range);

        if ($identity === null) {
            // Recorded, but not in this range: nothing to break down. A name never recorded is no agent.
            abort_if($lookup->ever($name) === null, 404);

            return response()->json([...AgentBreakdownResource::of($name, [], [], [], []), 'range' => $range->toArray()]);
        }

        return response()->json([
            ...AgentBreakdownResource::of(
                $identity->name,
                $breakdown->models($identity->name, $range),
                $breakdown->tools($identity->name, $range),
                $breakdown->delegatedModels($identity->name, $range),
                $breakdown->delegatedTools($identity->name, $range),
            ),
            'range' => $range->toArray(),
        ]);
    }
}
