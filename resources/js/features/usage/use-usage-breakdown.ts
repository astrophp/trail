import { usageApiParams, type UsageListView } from '@/api/usage-list-view'
import { fetchUsageBreakdown, usageKeys } from '@/api/usage'
import { useFollowingQuery } from '@/hooks/use-following-query'
import { failureLedger, type Refreshing } from '@/lib/refresh-policy'

/** The failed refreshes in a row, by view. */
const failures = failureLedger()

/** Forgets every view's failed refreshes: for tests, which share this module. */
export const forgetUsageBreakdownRefreshFailures = () => failures.reset()

/**
 * The breakdown of a view. It reads every step of the range, which is slow at large volume, so it
 * has no clock of its own and is not asked for on every tick of the totals: a request would be
 * cancelled by the next tick and never finish. It is asked for again once, when the totals settle
 * (no run is running any more), and a request in flight is never cancelled. `leader` is the
 * page's one query for the totals.
 *
 * The previous view's answer stays as placeholder data until the next arrives, as long as it
 * groups by the same thing: rows of models say nothing about rows of agents. A caller must check
 * `isPlaceholderData` before treating it as the answer.
 */
export function useUsageBreakdown(
    view: UsageListView,
    leader: {
        dataUpdatedAt: number
        isPlaceholderData: boolean
        refreshing: Refreshing
    },
) {
    const params = usageApiParams(view)

    return useFollowingQuery({
        queryKey: usageKeys.breakdown(params),
        fetch: (signal) => fetchUsageBreakdown(params, signal),
        ledger: failures,
        ledgerKey: JSON.stringify(view),
        leader,
        mode: 'settled',
        keepsPlaceholder: (key) => key[2] === view.by,
    })
}
