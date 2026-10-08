import {
    keepPreviousData,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { fetchOverview, overviewKeys } from '@/api/overview'
import {
    failureLedger,
    keepsAsking,
    refreshEvery,
    refreshState,
} from '@/lib/refresh-policy'
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
    const queryClient = useQueryClient()
    const key = overviewKeys.range(range)
    const loaded = queryClient.getQueryData(key) !== undefined
    const query = useQuery({
        queryKey: key,
        queryFn: async ({ signal }) => {
            try {
                const overview = await fetchOverview(range, signal)

                failures.clear(range)

                return overview
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
        refetchInterval: (current) =>
            keepsAsking(
                refreshState(
                    (current.state.data?.data.summary.runs.running ?? 0) > 0,
                    current.state.error instanceof ApiError
                        ? current.state.error.status
                        : null,
                    failures.count(range),
                ),
            )
                ? refreshEvery
                : false,
    })
    const running = (query.data?.data.summary.runs.running ?? 0) > 0

    return {
        ...query,
        refreshing: refreshState(
            running,
            query.error instanceof ApiError ? query.error.status : null,
            failures.count(range),
        ),
        /** Asks again now and, if refreshing had stopped, lets it go on. */
        refreshAgain: () => {
            failures.clear(range)

            return query.refetch()
        },
    }
}
