import { fetchUsageBreakdown, type UsageSort } from '@/api/usage'
import { rankedModelsShown } from '@/features/usage/ranked-models'
import { useFollowingQuery } from '@/hooks/use-following-query'
import { failureLedger, type Refreshing } from '@/lib/refresh-policy'
import type { TimeRangePreset } from '@/lib/time-range'

/** The failed refreshes in a row, by range and ranking. */
const failures = failureLedger()

/** Forgets every view's failed refreshes: for tests, which share this module. */
export const forgetRankedModelsRefreshFailures = () => failures.reset()

/**
 * The first models of the usage breakdown of a range, ranked by `sort`. Its key is its own: it
 * asks for a short page, which must never be taken for the Usage page's.
 *
 * It reads every step of the range, which is slow at large volume, so it has no clock of its own
 * and is not asked for on every tick of the page it sits in: a request would be cancelled by the
 * next tick and never finish. It is asked for again once, when `leader` settles, and a request in
 * flight is never cancelled.
 *
 * The previous range's answer stays as placeholder data until the next arrives, as long as it is
 * ranked the same way: rows ranked by runs say nothing about a ranking by cost. A caller must
 * check `isPlaceholderData` before treating it as the answer.
 */
export function useRankedModels(
    range: TimeRangePreset,
    sort: UsageSort,
    leader: {
        dataUpdatedAt: number
        isPlaceholderData: boolean
        refreshing: Refreshing
    },
) {
    return useFollowingQuery({
        queryKey: [
            'usage',
            'breakdown',
            'top-models',
            range,
            sort,
            rankedModelsShown,
        ],
        fetch: (signal) =>
            fetchUsageBreakdown(
                {
                    range,
                    by: 'model',
                    sort,
                    page: 1,
                    per_page: rankedModelsShown,
                },
                signal,
            ),
        ledger: failures,
        ledgerKey: `${range} ${sort}`,
        leader,
        mode: 'settled',
        keepsPlaceholder: (key) => key[4] === sort,
    })
}
