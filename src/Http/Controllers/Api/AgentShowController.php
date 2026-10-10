<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Http\Resources\AgentResource;
use Astro\Trail\Http\Resources\AttentionResource;
use Astro\Trail\Http\Resources\OverviewResource;
use Astro\Trail\Http\Resources\Timestamp;
use Astro\Trail\Queries\Agent;
use Astro\Trail\Queries\AgentIndex;
use Astro\Trail\Queries\AgentLookup;
use Astro\Trail\Queries\AgentName;
use Astro\Trail\Queries\AttentionQuery;
use Astro\Trail\Queries\BucketUnit;
use Astro\Trail\Queries\OverviewQuery;
use Astro\Trail\Queries\RawQuery;
use Astro\Trail\Queries\RunScope;
use Astro\Trail\Queries\TimeRange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AgentShowController
{
    public function __invoke(Request $request, AgentIndex $index, AgentLookup $lookup, OverviewQuery $overviews, AttentionQuery $attention): JsonResponse
    {
        // A name the column could not hold is no agent, and is not sent to the database.
        $name = RawQuery::string($request, 'name');
        abort_unless($name !== null && AgentName::isPossible($name), 404);

        $range = TimeRange::fromRequest($request);

        $agent = $index->find($range, $name);

        if ($agent === null) {
            // Recorded, but not in this range: the agent without figures. A name never recorded is no agent.
            $identity = $lookup->ever($name);
            abort_if($identity === null, 404);
            $agent = Agent::quiet($identity, count(BucketUnit::for($range)->buckets($range)));
        }

        $overview = $overviews->read($range, RunScope::agent($agent->name));

        return response()->json([
            'data' => [
                'agent' => AgentResource::of($agent),
                ...OverviewResource::of($overview),
                'attention' => AttentionResource::of($attention->read($range, RunScope::agent($agent->name)), $agent->name),
            ],
            'range' => $range->toArray(),
            'previous_range' => [
                'from' => Timestamp::format($overview->previousRange->from),
                'to' => Timestamp::format($overview->previousRange->to),
            ],
        ]);
    }
}
