import { agentKeys, fetchAgent } from '@/api/agents'
import { useRefreshingQuery } from '@/hooks/use-refreshing-query'
import { failureLedger } from '@/lib/refresh-policy'
import type { TimeRangePreset } from '@/lib/time-range'

/** The failed refreshes in a row, by agent and range. */
const failures = failureLedger()

/** Forgets every view's failed refreshes: for tests, which share this module. */
export const forgetAgentRefreshFailures = () => failures.reset()

/** What one agent in one range is called in the ledger and in the failures of the page: the agent and the range together. */
export const agentViewKey = (name: string, range: TimeRangePreset): string =>
    JSON.stringify([name, range])

/**
 * One agent in a range. The previous range's answer for the same agent stays as placeholder data
 * until the next one arrives, so a caller must check `isPlaceholderData` before treating it as
 * the answer; another agent's answer is never a placeholder. While any of its runs is running it
 * is asked for again every `refreshEvery`, until none is, after repeated failures or a final
 * answer (a name that was never recorded is final). An empty name asks for nothing.
 */
export function useAgent(name: string, range: TimeRangePreset) {
    return useRefreshingQuery({
        queryKey: agentKeys.show(name, range),
        fetch: (signal) => fetchAgent(name, range, signal),
        ledger: failures,
        ledgerKey: agentViewKey(name, range),
        isRunning: (answer) => answer.data.summary.runs.running > 0,
        keepsPlaceholder: (key) => key[2] === name,
        enabled: name !== '',
    })
}
