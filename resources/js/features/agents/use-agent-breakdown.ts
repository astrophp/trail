import { agentKeys, fetchAgentBreakdown } from '@/api/agents'
import { agentViewKey, useAgent } from '@/features/agents/use-agent'
import { useFollowingQuery } from '@/hooks/use-following-query'
import { failureLedger } from '@/lib/refresh-policy'
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
 * It has no clock of its own. It is asked for again whenever the agent's own query for the same
 * view is, which is while one of its runs is running.
 */
export function useAgentBreakdown(name: string, range: TimeRangePreset) {
    const leader = useAgent(name, range)

    return useFollowingQuery({
        queryKey: agentKeys.breakdown(name, range),
        fetch: (signal) => fetchAgentBreakdown(name, range, signal),
        ledger: failures,
        ledgerKey: agentViewKey(name, range),
        leader,
        keepsPlaceholder: (key) => key[2] === name,
        enabled: name !== '',
    })
}
