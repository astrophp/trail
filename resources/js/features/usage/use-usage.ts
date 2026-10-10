import { fetchUsage, usageKeys } from '@/api/usage'
import { useRefreshingQuery } from '@/hooks/use-refreshing-query'
import { failureLedger } from '@/lib/refresh-policy'
import type { TimeRangePreset } from '@/lib/time-range'

/** The failed refreshes in a row, by range. */
const failures = failureLedger()

/** Forgets every range's failed refreshes: for tests, which share this module. */
export const forgetUsageRefreshFailures = () => failures.reset()

/**
 * The totals of a range. The previous range's response stays as placeholder data until the next
 * one arrives, so a caller must check `isPlaceholderData` before treating it as the answer.
 *
 * While any run of the range is running it is asked for again every `refreshEvery`, until none is,
 * after repeated failures or a final answer. The breakdown follows this query rather than keeping
 * a clock of its own.
 */
export function useUsage(range: TimeRangePreset) {
    return useRefreshingQuery({
        queryKey: usageKeys.range(range),
        fetch: (signal) => fetchUsage(range, signal),
        ledger: failures,
        ledgerKey: range,
        isRunning: (usage) => usage.data.summary.runs.running > 0,
    })
}

export type UsageQuery = ReturnType<typeof useUsage>
