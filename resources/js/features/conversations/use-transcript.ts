import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { ApiError, isNotFound } from '@/api/client'
import { conversationKeys, fetchTranscript } from '@/api/conversations'
import {
    fromWindow,
    isPossibleTurn,
    isRunning,
    placed,
    withEarlier,
    withLater,
    withRefreshed,
    type TranscriptData,
} from '@/features/conversations/transcript-state'
import { numberTurns } from '@/features/conversations/transcript-turns'
import {
    failureLedger,
    keepsAsking,
    refreshEvery,
    refreshState,
} from '@/lib/refresh-policy'

/** The failed refreshes in a row, by transcript. */
const failures = failureLedger()

/** Forgets every transcript's failed refreshes: for tests, which share this module. */
export const forgetTranscriptRefreshFailures = () => failures.reset()

type Direction = 'earlier' | 'later'

/**
 * One conversation's transcript. The first answer is the window ending at the turn the address
 * named (the newest turns without one); earlier and later windows are put before and after what
 * is loaded, on request. They are stored as one run of turns in one query keyed by the id and
 * that first turn, so there is no placeholder data: another conversation never shows the previous
 * one's turns. An empty id asks for nothing.
 *
 * Asking again (the interval, the shell's refresh control, coming back to the page) never reloads
 * the page: it asks for each turn that is running by itself and, when the newest turns are
 * loaded, for the turns after the last one, and puts the answers into what is held by run id, so
 * loaded windows, what is open and where the reader is all stay. While any loaded turn is running
 * that happens every `refreshEvery`, until the turns stop running, after repeated failures or a
 * final answer; TanStack Query pauses the interval in a hidden tab. A refresh that fails keeps
 * everything on screen.
 */
export function useTranscript(id: string, anchor: string) {
    const queryClient = useQueryClient()
    const key = conversationKeys.transcript(id, anchor)
    const scope = JSON.stringify(key)
    const loaded = queryClient.getQueryData(key) !== undefined
    const query = useQuery<TranscriptData>({
        enabled: id !== '',
        queryKey: key,
        queryFn: async ({ signal }) => {
            const held = queryClient.getQueryData<TranscriptData>(key)

            if (held === undefined) {
                // A turn no run can have is refused by the API: it is a turn that is gone.
                const possible = anchor === '' || isPossibleTurn(anchor)

                return fromWindow(
                    await fetchTranscript(
                        {
                            id,
                            turn:
                                anchor === '' || !possible ? undefined : anchor,
                        },
                        signal,
                    ),
                    possible ? null : anchor,
                )
            }

            try {
                const last = held.turns.at(-1)?.trace.id
                const running = held.turns.filter(isRunning)
                // With nothing running there is still the conversation's figures to bring up to date.
                const ids = new Set(
                    running.length > 0 || last === undefined
                        ? running.map((turn) => turn.trace.id)
                        : [last],
                )

                // With later turns not loaded, the last one's answer says how many lie after it.
                if (held.newer > 0 && last !== undefined) {
                    ids.add(last)
                }

                const each = [...ids].map((turn) =>
                    fetchTranscript({ id, turn, limit: 1 }, signal),
                )
                const later =
                    held.newer === 0 && last !== undefined
                        ? fetchTranscript({ id, after: last }, signal)
                        : null
                const [answers, newer] = await Promise.all([
                    Promise.all(each),
                    later,
                ])

                failures.clear(scope)

                // Merged into what is held now, not into what was held when the request went: a
                // window loaded meanwhile is not dropped.
                return withRefreshed(
                    queryClient.getQueryData<TranscriptData>(key) ?? held,
                    answers,
                    newer,
                )
            } catch (error) {
                // A cancelled request is not a failure of the server.
                if (!signal.aborted) {
                    failures.record(scope)
                }

                throw error
            }
        },
        // With turns on screen a failed refresh is not repeated: the next tick is the retry.
        ...(loaded ? { retry: false } : {}),
        refetchInterval: (current) => {
            const state = refreshState(
                current.state.data?.turns.some(isRunning) ?? false,
                current.state.error instanceof ApiError
                    ? current.state.error.status
                    : null,
                failures.count(scope),
            )

            return keepsAsking(state) ? refreshEvery : false
        },
    })
    const data = query.data

    // What a load of more turns is doing and what went wrong with it, kept with the transcript it
    // is for, so another conversation never shows it.
    const [busy, setBusy] = useState<{ scope: string; direction: Direction }>()
    const [failure, setFailure] = useState<{
        scope: string
        direction: Direction
        error: unknown
    } | null>(null)

    // Resolves to whether the turns arrived. The error stays until a load succeeds, so the retry
    // button is never replaced under focus.
    const loadMore = useCallback(
        async (direction: Direction): Promise<boolean> => {
            const held = queryClient.getQueryData<TranscriptData>(key)
            const edge =
                direction === 'earlier' ? held?.turns[0] : held?.turns.at(-1)

            if (edge === undefined) {
                return false
            }

            setBusy({ scope, direction })

            try {
                const response = await fetchTranscript(
                    direction === 'earlier'
                        ? { id, before: edge.trace.id }
                        : { id, after: edge.trace.id },
                )

                // The turn the window was to follow is not recorded any more: nothing can be added.
                if (!placed(response)) {
                    throw new Error(
                        'The turn next to them is no longer recorded. Reload the page to see the conversation as it is.',
                    )
                }

                queryClient.setQueryData<TranscriptData>(key, (current) =>
                    current === undefined
                        ? undefined
                        : direction === 'earlier'
                          ? withEarlier(current, response)
                          : withLater(current, response),
                )
                setFailure(null)

                return true
            } catch (error) {
                setFailure({ scope, direction, error })

                return false
            } finally {
                setBusy(undefined)
            }
        },
        [queryClient, key, scope, id],
    )
    const loadEarlier = useCallback(() => loadMore('earlier'), [loadMore])
    const loadLater = useCallback(() => loadMore('later'), [loadMore])
    const failureOf = (direction: Direction) =>
        failure !== null &&
        failure.scope === scope &&
        failure.direction === direction
            ? { error: failure.error }
            : null
    const loading = (direction: Direction) =>
        busy?.scope === scope && busy.direction === direction

    const older = data?.older ?? 0
    const turns = useMemo(
        () => numberTurns(data?.turns ?? [], older),
        [data?.turns, older],
    )
    const error = query.error
    const state = refreshState(
        data?.turns.some(isRunning) ?? false,
        error instanceof ApiError ? error.status : null,
        failures.count(scope),
    )

    return {
        /** The conversation as the last answer states it; `undefined` until one is in. */
        conversation: data?.conversation,
        turns,
        /** Turns before the first loaded one, counted by the database. */
        older,
        /** Turns after the last loaded one, counted by the database. */
        newer: data?.newer ?? 0,
        /** The turn the address named that the conversation does not have, else `null`. */
        missing: data?.missing ?? null,
        loading: query.isPending && id !== '',
        notFound: id === '' || (data === undefined && isNotFound(error)),
        /** The first load failed (not a 404). */
        failed:
            id !== '' &&
            query.isError &&
            data === undefined &&
            !isNotFound(error),
        error,
        retry: () => void query.refetch(),
        retrying: query.isFetching && data === undefined,
        loadEarlier,
        loadingEarlier: loading('earlier'),
        earlierFailure: failureOf('earlier'),
        loadLater,
        loadingLater: loading('later'),
        laterFailure: failureOf('later'),
        /** Where refreshing the running turns stands; see `Refreshing`. */
        refreshing: state,
        /** The last refresh failed, whatever is running: what is on screen is from before it. */
        refreshFailed: query.isError && data !== undefined,
        /** Asks again now and, if refreshing had stopped, lets it go on. */
        retryRefresh: () => {
            failures.clear(scope)
            void query.refetch()
        },
    }
}
