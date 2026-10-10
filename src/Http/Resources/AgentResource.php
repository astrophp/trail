<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Queries\Agent;
use Astro\Trail\Queries\Delegations;
use Astro\Trail\Queries\RunFigures;

/**
 * An agent as every endpoint returns it. What the agent did as a run of its own ("top level") and
 * the times it was delegated to are kept apart, and a figure that does not exist for one is null
 * rather than zero.
 */
final class AgentResource
{
    /**
     * @return array<string, mixed>
     */
    public static function of(Agent $agent): array
    {
        return [
            'name' => $agent->name,
            'agent_class' => $agent->agentClass,
            'type' => $agent->type->value,
            'top_level' => $agent->topLevel === null ? null : self::topLevel($agent->topLevel, $agent),
            'delegated' => $agent->delegated === null ? null : self::delegated($agent->delegated),
            'last_activity_at' => Timestamp::format($agent->lastActivityAt()),
            'activity' => $agent->activity,
        ];
    }

    /**
     * The summary's figures for the agent's own runs, without the percentile and the usage coverage.
     *
     * @return array<string, mixed>
     */
    private static function topLevel(RunFigures $figures, Agent $agent): array
    {
        $runs = $figures->runs;

        return [
            'runs' => $runs,
            'error_rate' => SummaryResource::errorRate($figures),
            'duration' => [
                'average_ms' => SummaryResource::average($figures),
                'measured' => $figures->measured,
                'not_measured' => $runs['all'] - $figures->measured,
            ],
            'usage' => SummaryResource::usage($figures),
            'cost' => SummaryResource::cost($figures, $runs['running'] > 0),
            'cost_coverage' => [
                'unpriced_runs' => $figures->unpricedRuns,
                'runs_without_amount' => $figures->withoutAmount,
            ],
            'last_activity_at' => Timestamp::format($agent->lastRunAt),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function delegated(Delegations $delegated): array
    {
        return [
            'all' => $delegated->all,
            'failed' => $delegated->failed,
            'incomplete' => $delegated->incomplete,
            'last_activity_at' => Timestamp::format($delegated->lastAt),
        ];
    }
}
