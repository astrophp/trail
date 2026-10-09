import { fetchUsageSpend, usageKeys } from '@/api/usage'
import { useFollowingQuery } from '@/hooks/use-following-query'
import { failureLedger, type Refreshing } from '@/lib/refresh-policy'
import type { TimeRangePreset } from '@/lib/time-range'

/** The failed refreshes in a row, by range. */
const failures = failureLedger()

/** Forgets every range's failed refreshes: for tests, which share this module. */
export const forgetUsageSpendRefreshFailures = () => failures.reset()

/**
 * The estimated cost of a range, bucket by bucket, and its projection. It reads the runs of the
 * range and the saved prices, so it has no clock of its own and is not asked for on every tick of
 * the totals: a request would be cancelled by the next tick and never finish. It is asked for
 * again once, when the totals settle (no run is running any more), and a request in flight is
 * never cancelled. `leader` is the page's one query for the totals.
 *
 * The previous range's answer stays as placeholder data until the next arrives, so a caller must
 * check `isPlaceholderData` before treating it as the answer.
 */
export function useUsageSpend(
    range: TimeRangePreset,
    leader: {
        dataUpdatedAt: number
        isPlaceholderData: boolean
        refreshing: Refreshing
    },
) {
    return useFollowingQuery({
        queryKey: usageKeys.spend(range),
        fetch: (signal) => fetchUsageSpend(range, signal),
        ledger: failures,
        ledgerKey: range,
        leader,
        mode: 'settled',
    })
}
