import { fetchAttention, overviewKeys } from '@/api/overview'
import { useOverview } from '@/features/overview/use-overview'
import { useFollowingQuery } from '@/hooks/use-following-query'
import { failureLedger } from '@/lib/refresh-policy'
import type { TimeRangePreset } from '@/lib/time-range'

/** The failed refreshes in a row, by range. */
const failures = failureLedger()

/** Forgets every range's failed refreshes: for tests, which share this module. */
export const forgetAttentionRefreshFailures = () => failures.reset()

/**
 * What needs attention in a range. The previous range's list stays as placeholder data until the
 * next one arrives, so a caller must check `isPlaceholderData` before treating it as the answer.
 *
 * It has no clock of its own. It is asked for again whenever the overview of the same range is
 * (which is while a run of the range is running, and stops when the overview stops), so the two
 * follow one cadence and one back-off. A refresh that fails keeps the last list; after
 * `maxFailedRefreshes` in a row it is not asked for again until the person asks.
 */
export function useAttention(range: TimeRangePreset) {
    const leader = useOverview(range)

    return useFollowingQuery({
        queryKey: overviewKeys.attention(range),
        fetch: (signal) => fetchAttention(range, signal),
        ledger: failures,
        ledgerKey: range,
        leader,
    })
}
