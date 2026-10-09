import type { Agent } from '@/api/types'
import { Sparkline } from '@/components/patterns/sparkline'
import { NotApplicable } from '@/features/agents/not-applicable'
import { formatCount } from '@/lib/format'

/**
 * The agent's own runs over the range as a trend. Its words come from the run count the API
 * gave, never from adding the buckets. An agent without runs of its own has no trend: a line of
 * zeros would say it was idle, so nothing is drawn.
 *
 * `period` finishes the sentence "N runs in …": "the last 24 hours".
 */
export function ActivityCell({
    agent,
    period,
}: {
    agent: Agent
    period: string
}) {
    const own = agent.top_level

    if (own === null) {
        return <NotApplicable />
    }

    return (
        <Sparkline
            className="w-16"
            values={agent.activity}
            summary={`${formatCount(own.runs.all)} ${own.runs.all === 1 ? 'run' : 'runs'} in ${period}`}
        />
    )
}
