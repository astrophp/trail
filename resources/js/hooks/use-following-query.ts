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
    /** Asks for nothing while `false`, such as for a view that names nothing to ask about. */
    enabled?: boolean
    /**
     * `every` (the default): asked for again on every refresh of the leader, the latest trigger
     * cancelling a request still in flight; for what is cheap to ask for. `settled`: for what is
     * slow by nature. It is asked for again once, when the leader settles (nothing in it is
     * running any more), never while one of its own requests is in flight, which is not
     * cancelled: a request that takes longer than the leader's tick would never finish.
     */
    mode?: 'every' | 'settled'
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
    enabled = true,
    mode = 'every',
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
        enabled,
        ...(loaded ? { retry: false } : {}),
    })
    const { refetch } = query
    const { dataUpdatedAt, isPlaceholderData: leaderIsPlaceholder } = leader
    const hasAnswer = query.data !== undefined && !query.isPlaceholderData
    const failedStatus = failureStatus(query.error)
    const failedInARow = ledger.count(ledgerKey)
    const mayAsk = keepsAsking(refreshState(true, failedStatus, failedInARow))
    const seen = useRef({ ledgerKey, at: dataUpdatedAt })
    // `settled`: the leader's answer this query reflects (`null` until the leader's first real one),
    // and whether a request is owed once the one in flight lands.
    const reflects = useRef<{ key: string; at: number | null }>({
        key: ledgerKey,
        at: null,
    })
    const owed = useRef(false)
    const leaderSettled = leader.refreshing === 'ended'
    const { isFetching } = query

    useEffect(() => {
        if (mode !== 'settled') {
            return
        }

        if (reflects.current.key !== ledgerKey) {
            reflects.current = { key: ledgerKey, at: null }
        }

        if (leaderIsPlaceholder || dataUpdatedAt === 0) {
            return
        }

        if (reflects.current.at === null) {
            // The leader's first answer for this view: the request made for it is the answer.
            reflects.current.at = dataUpdatedAt

            return
        }

        if (
            !leaderSettled ||
            reflects.current.at === dataUpdatedAt ||
            !mayAsk
        ) {
            return
        }

        reflects.current.at = dataUpdatedAt

        // One request: now, or once the one in flight (the first, perhaps) has landed. An answer
        // that is on its way is older than the leader's, so it does not do.
        if (isFetching) {
            owed.current = true
        } else {
            void refetch()
        }
    }, [
        mode,
        ledgerKey,
        dataUpdatedAt,
        leaderIsPlaceholder,
        leaderSettled,
        mayAsk,
        isFetching,
        refetch,
    ])

    useEffect(() => {
        if (mode === 'settled' && owed.current && !isFetching && enabled) {
            owed.current = false
            void refetch()
        }
    }, [mode, isFetching, enabled, refetch])

    useEffect(() => {
        if (mode === 'settled') {
            return
        }

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
        mode,
        ledgerKey,
        dataUpdatedAt,
        leaderIsPlaceholder,
        hasAnswer,
        mayAsk,
        refetch,
    ])

    return {
        ...query,
        /**
         * Where asking again for this query stands. It only goes on while the leader does, except in
         * `settled` mode, which is asked for again once and so never polls.
         */
        refreshing:
            mode === 'settled'
                ? 'ended'
                : refreshState(
                      keepsAsking(leader.refreshing),
                      failedStatus,
                      failedInARow,
                  ),
        /** `settled` mode: the leader is still running something, so what is shown waits for it. */
        waitingForLeader: mode === 'settled' && keepsAsking(leader.refreshing),
        /** Asks again now and, if refreshing had stopped, lets it go on. */
        refreshAgain: () => {
            ledger.clear(ledgerKey)

            return query.refetch()
        },
    }
}
