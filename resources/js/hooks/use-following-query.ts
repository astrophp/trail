import {
    keepPreviousData,
    useQuery,
    useQueryClient,
    type QueryKey,
} from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import {
    failureStatus,
    keepsAsking,
    refreshState,
    type FailureLedger,
    type Refreshing,
} from '@/lib/refresh-policy'

type FollowingQuery<TData> = {
    queryKey: QueryKey
    fetch: (signal: AbortSignal) => Promise<TData>
    /** The failed refreshes in a row, by `ledgerKey`; see `useRefreshingQuery`. */
    ledger: FailureLedger
    /** What is being asked, which a failure and a refresh belong to: a range, or an agent in a range. */
    ledgerKey: string
    /** The query this one follows: it is asked for again whenever the leader of the same view is. */
    leader: {
        dataUpdatedAt: number
        isPlaceholderData: boolean
        refreshing: Refreshing
    }
    /** Whether the previous view's answer belongs to this view; see `useRefreshingQuery`. */
    keepsPlaceholder?: (previousKey: QueryKey) => boolean
}

/**
 * A query of its own that has no clock of its own. It is asked for again whenever its leader, the
 * query of the same view, is (which is while something in the leader is running, and stops when
 * the leader stops), so the two follow one cadence and one back-off. A refresh that fails keeps the
 * last data; after `maxFailedRefreshes` in a row it is not asked for again until the person asks.
 *
 * The previous view's answer stays as placeholder data until the next one arrives, so a caller
 * must check `isPlaceholderData` before treating it as the answer.
 */
export function useFollowingQuery<TData>({
    queryKey,
    fetch,
    ledger,
    ledgerKey,
    leader,
    keepsPlaceholder,
}: FollowingQuery<TData>) {
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
        ...(loaded ? { retry: false } : {}),
    })
    const { refetch } = query
    const { dataUpdatedAt, isPlaceholderData: leaderIsPlaceholder } = leader
    const hasAnswer = query.data !== undefined && !query.isPlaceholderData
    const failedStatus = failureStatus(query.error)
    const failedInARow = ledger.count(ledgerKey)
    const mayAsk = keepsAsking(refreshState(true, failedStatus, failedInARow))
    const seen = useRef({ ledgerKey, at: dataUpdatedAt })

    useEffect(() => {
        const before = seen.current

        seen.current = { ledgerKey, at: dataUpdatedAt }

        // Only a leader of this view that was asked for again: its first answer, or another
        // view's, is not a reason to ask.
        if (
            before.ledgerKey !== ledgerKey ||
            before.at === 0 ||
            before.at === dataUpdatedAt ||
            leaderIsPlaceholder ||
            !hasAnswer ||
            !mayAsk
        ) {
            return
        }

        // The latest trigger wins: an earlier request still in flight is cancelled, since the
        // answer it would bring is older than the leader's.
        void refetch({ cancelRefetch: true })
    }, [
        ledgerKey,
        dataUpdatedAt,
        leaderIsPlaceholder,
        hasAnswer,
        mayAsk,
        refetch,
    ])

    return {
        ...query,
        /** Where asking again for this query stands; it only goes on while the leader does. */
        refreshing: refreshState(
            keepsAsking(leader.refreshing),
            failedStatus,
            failedInARow,
        ),
        /** Asks again now and, if refreshing had stopped, lets it go on. */
        refreshAgain: () => {
            ledger.clear(ledgerKey)

            return query.refetch()
        },
    }
}
