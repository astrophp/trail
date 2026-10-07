<?php

namespace Astro\Trail\Http\Controllers\Api;

use Astro\Trail\Queries\Meta;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Storage\StaleRuns;
use Astro\Trail\Trail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MetaController
{
    public function __invoke(Request $request, Meta $meta, Trail $trail): JsonResponse
    {
        $range = TimeRange::fromRequest($request);

        return response()->json([
            'data' => [
                'app' => $trail->application(),
                'version' => $trail->version(),
                'recording' => $trail->recording(),
                'stale_after' => StaleRuns::timeout(),
                'traces' => ['any' => $meta->anyTraces(), 'running' => $meta->runningCount()],
                'filters' => [
                    'agents' => $meta->agents($range),
                    'providers' => $meta->providers($range),
                    'models' => $meta->models($range),
                ],
            ],
            'range' => $range->toArray(),
        ]);
    }
}
