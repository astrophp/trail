import { agentKeys, fetchAgentBreakdown } from '@/api/agents'
import { agentViewKey } from '@/features/agents/use-agent'
import { useFollowingQuery } from '@/hooks/use-following-query'
import { failureLedger, type Refreshing } from '@/lib/refresh-policy'
import type { TimeRangePreset } from '@/lib/time-range'

/** The failed refreshes in a row, by agent and range. */
const failures = failureLedger()

/** Forgets every view's failed refreshes: for tests, which share this module. */
export const forgetBreakdownRefreshFailures = () => failures.reset()

/**
 * The models and tools of one agent in a range. It is a request of its own, because it reads every
 * span of the agent and is slow at large volume by nature, so nothing else on the page waits for
 * it. The previous range's answer for the same agent stays as placeholder data until the next
 * arrives; another agent's never does.
 *
 * It has no clock of its own, and it is not asked for on every tick of the agent's query: it is
 * slow, so a request would be cancelled by the next tick and never finish. It is asked for again
 * once, when the agent's query settles (no run is running any more), and a request in flight is
 * never cancelled. `leader` is the state of the page's one query for the agent; there is no second
 * observer of it here.
 */
export function useAgentBreakdown(
    name: string,
    range: TimeRangePreset,
    leader: {
        dataUpdatedAt: number
        isPlaceholderData: boolean
        refreshing: Refreshing
    },
) {
    return useFollowingQuery({
        queryKey: agentKeys.breakdown(name, range),
        fetch: (signal) => fetchAgentBreakdown(name, range, signal),
        ledger: failures,
        ledgerKey: agentViewKey(name, range),
        leader,
        mode: 'settled',
        keepsPlaceholder: (key) => key[2] === name,
        enabled: name !== '',
    })
}
