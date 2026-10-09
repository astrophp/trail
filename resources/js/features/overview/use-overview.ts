import { fetchOverview, overviewKeys } from '@/api/overview'
import { useRefreshingQuery } from '@/hooks/use-refreshing-query'
import { failureLedger } from '@/lib/refresh-policy'
import type { TimeRangePreset } from '@/lib/time-range'

/** The failed refreshes in a row, by range. */
const failures = failureLedger()

/** Forgets every range's failed refreshes: for tests, which share this module. */
export const forgetOverviewRefreshFailures = () => failures.reset()

/**
 * The overview of a range. The previous range's response stays as placeholder data until the next
 * one arrives, so a caller must check `isPlaceholderData` before treating it as the answer.
 *
 * While any run of the range is running it is asked for again every `refreshEvery`, until none is,
 * after repeated failures or a final answer; TanStack Query pauses the interval in a hidden tab.
 * A refresh that fails keeps the last data and is not repeated within its tick.
 */
export function useOverview(range: TimeRangePreset) {
    return useRefreshingQuery({
        queryKey: overviewKeys.range(range),
        fetch: (signal) => fetchOverview(range, signal),
        ledger: failures,
        ledgerKey: range,
        isRunning: (overview) => overview.data.summary.runs.running > 0,
    })
}
