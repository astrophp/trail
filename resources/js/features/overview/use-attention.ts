import {
    keepPreviousData,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { ApiError } from '@/api/client'
import { fetchAttention, overviewKeys } from '@/api/overview'
import { useOverview } from '@/features/overview/use-overview'
import { failureLedger, keepsAsking, refreshState } from '@/lib/refresh-policy'
import type { TimeRangePreset } from '@/lib/time-range'

/** The failed refreshes in a row, by range. */
const failures = failureLedger()

/** Forgets every range's failed refreshes: for tests, which share this module. */
export const forgetAttentionRefreshFailures = () => failures.reset()

const statusOf = (error: unknown) =>
    error instanceof ApiError ? error.status : null

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
    const queryClient = useQueryClient()
    const overview = useOverview(range)
    const key = overviewKeys.attention(range)
    const loaded = queryClient.getQueryData(key) !== undefined
    const query = useQuery({
        queryKey: key,
        queryFn: async ({ signal }) => {
            try {
                const attention = await fetchAttention(range, signal)

                failures.clear(range)

                return attention
            } catch (error) {
                // A cancelled request is not a failure of the server.
                if (!signal.aborted) {
                    failures.record(range)
                }

                throw error
            }
        },
        placeholderData: keepPreviousData,
        ...(loaded ? { retry: false } : {}),
    })
    const { refetch } = query
    const { dataUpdatedAt, isPlaceholderData: overviewIsPlaceholder } = overview
    const hasList = query.data !== undefined && !query.isPlaceholderData
    const failedStatus = statusOf(query.error)
    const failedInARow = failures.count(range)
    const mayAsk = keepsAsking(refreshState(true, failedStatus, failedInARow))
    const seen = useRef({ range, at: dataUpdatedAt })

    useEffect(() => {
        const before = seen.current

        seen.current = { range, at: dataUpdatedAt }

        // Only an overview of this range that was asked for again: its first answer, or another
        // range's, is not a reason to ask.
        if (
            before.range !== range ||
            before.at === 0 ||
            before.at === dataUpdatedAt ||
            overviewIsPlaceholder ||
            !hasList ||
            !mayAsk
        ) {
            return
        }

        void refetch({ cancelRefetch: false })
    }, [range, dataUpdatedAt, overviewIsPlaceholder, hasList, mayAsk, refetch])

    return {
        ...query,
        /** Where asking again for this list stands; it only goes on while the overview does. */
        refreshing: refreshState(
            keepsAsking(overview.refreshing),
            failedStatus,
            failedInARow,
        ),
        /** Asks again now and, if refreshing had stopped, lets it go on. */
        refreshAgain: () => {
            failures.clear(range)

            return query.refetch()
        },
    }
}
