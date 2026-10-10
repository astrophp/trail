import {
    keepPreviousData,
    useQuery,
    useQueryClient,
    type QueryKey,
} from '@tanstack/react-query'
import {
    failureStatus,
    keepsAsking,
    refreshEvery,
    refreshState,
    type FailureLedger,
} from '@/lib/refresh-policy'

type RefreshingQuery<TData> = {
    queryKey: QueryKey
    /** Asks for the data. A cancelled request is not counted as a failure of the server. */
    fetch: (signal: AbortSignal) => Promise<TData>
    /**
     * The failed refreshes in a row, by `ledgerKey`: one ledger per kind of page, which the page's
     * words on screen share with its data hooks.
     */
    ledger: FailureLedger
    /** What is being asked, which a failure belongs to: a range, or an agent in a range. */
    ledgerKey: string
    /** Whether something in an answer is still running, which is the one reason to ask again. */
    isRunning: (data: TData) => boolean
    /**
     * The previous view's answer is kept as placeholder data while the next loads. Say whether it
     * belongs to this view: another view's answer is no placeholder, and `undefined` shows none.
     */
    keepsPlaceholder?: (previousKey: QueryKey) => boolean
    /** Asks for nothing while `false`, such as for a view that names nothing to ask about. */
    enabled?: boolean
}

/**
 * A query whose answer is asked for again while something in it is running, until nothing is,
 * after repeated failures or a final answer; TanStack Query pauses the interval in a hidden tab.
 * A refresh that fails keeps the last data and is not repeated within its tick.
 *
 * The previous view's answer stays as placeholder data until the next one arrives, so a caller
 * must check `isPlaceholderData` before treating it as the answer.
 */
export function useRefreshingQuery<TData>({
    queryKey,
    fetch,
    ledger,
    ledgerKey,
    isRunning,
    keepsPlaceholder,
    enabled = true,
}: RefreshingQuery<TData>) {
    const queryClient = useQueryClient()
    const loaded = queryClient.getQueryData(queryKey) !== undefined
    const query = useQuery({
        queryKey,
        queryFn: async ({ signal }) => {
            try {
                const answer = await fetch(signal)

                ledger.clear(ledgerKey)

                return answer
            } catch (error) {
                // A cancelled request is not a failure of the server.
                if (!signal.aborted) {
                    ledger.record(ledgerKey)
                }

                throw error
            }
        },
        placeholderData: (previous, previousQuery) =>
            keepsPlaceholder === undefined ||
            previousQuery === undefined ||
            keepsPlaceholder(previousQuery.queryKey)
                ? keepPreviousData(previous)
                : undefined,
        enabled,
        ...(loaded ? { retry: false } : {}),
        refetchInterval: (current) =>
            keepsAsking(
                refreshState(
                    current.state.data !== undefined &&
                        isRunning(current.state.data),
                    failureStatus(current.state.error),
                    ledger.count(ledgerKey),
                ),
            )
                ? refreshEvery
                : false,
    })
    // Placeholder data is the previous view's answer: it says nothing about this one's runs.
    const running =
        !query.isPlaceholderData &&
        query.data !== undefined &&
        isRunning(query.data)

    return {
        ...query,
        refreshing: refreshState(
            running,
            failureStatus(query.error),
            ledger.count(ledgerKey),
        ),
        /** Asks again now and, if refreshing had stopped, lets it go on. */
        refreshAgain: () => {
            ledger.clear(ledgerKey)

            return query.refetch()
        },
    }
}
