import { useIsMutating, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { fetchTrace, traceKeys } from '@/api/traces'
import type { Status } from '@/api/types'

/** How often a run that is still running is fetched again, in milliseconds. */
export const refreshEvery = 2_000

/** Refreshing stops after this many failed refreshes in a row. */
export const maxFailedRefreshes = 3

/** Answers that will not change by asking again: the run is gone, or the session or access is. */
const final = new Set([401, 403, 404, 419])

/** The failed refreshes in a row, by run; a run is absent while its last refresh worked. */
const failures = new Map<string, number>()

/**
 * Where a run's refreshing stands, which is the one condition the interval and the words on the
 * page both follow:
 * - `polling`: asked for again every `refreshEvery`.
 * - `retrying`: the last refresh failed; asking goes on.
 * - `stopped`: it failed `maxFailedRefreshes` times in a row; asking stopped.
 * - `final`: the answer was final (the run is gone, or the session or access is); asking stopped.
 * - `ended`: the run is not running, so there is nothing to refresh.
 */
export type Refreshing = 'polling' | 'retrying' | 'stopped' | 'final' | 'ended'

export function refreshing(
    status: Status | undefined,
    error: unknown,
    failed: number,
): Refreshing {
    if (status !== 'running') {
        return 'ended'
    }

    if (
        error instanceof ApiError &&
        error.status !== null &&
        final.has(error.status)
    ) {
        return 'final'
    }

    if (failed >= maxFailedRefreshes) {
        return 'stopped'
    }

    return failed > 0 ? 'retrying' : 'polling'
}

/** How many refreshes of the run failed in a row, as of now. */
export const failedRefreshes = (id: string) => failures.get(id) ?? 0

/**
 * One run with its spans. There is deliberately no placeholder data: when the id changes, the
 * previous run's spans must never show under the next run's header, so the new run loads from
 * nothing (or from its own cache).
 *
 * While the run is `running` it is fetched again every `refreshEvery`, and the data is swapped in
 * place. Asking stops by itself as soon as an answer says otherwise, after a final error (a run
 * that is gone), after `maxFailedRefreshes` failures in a row, and while a bookmark is being
 * saved, so that an answer from before the press cannot undo it. TanStack Query pauses the
 * interval in a hidden tab. A refresh that fails keeps the last data, and is not repeated within
 * its tick: only a first load retries. Pass `refresh: false` for a reader that only wants the
 * data, so the same run is not asked for twice; `enabled: false` asks for nothing at all.
 */
export function useTrace(id: string, { refresh = true, enabled = true } = {}) {
    const queryClient = useQueryClient()
    const saving = useIsMutating({ mutationKey: traceKeys.bookmark }) > 0
    const loaded = queryClient.getQueryData(traceKeys.detail(id)) !== undefined

    return useQuery({
        enabled,
        queryKey: traceKeys.detail(id),
        queryFn: async ({ signal }) => {
            try {
                const trace = await fetchTrace(id, signal)

                failures.delete(id)

                return trace
            } catch (error) {
                // A cancelled request is not a failure of the server.
                if (!signal.aborted) {
                    failures.set(id, (failures.get(id) ?? 0) + 1)
                }

                throw error
            }
        },
        // With a run on screen a failed refresh is not repeated: the next tick is the retry.
        ...(loaded ? { retry: false } : {}),
        refetchInterval: (query) => {
            const state = refreshing(
                query.state.data?.data.trace.status,
                query.state.error,
                failedRefreshes(id),
            )

            return refresh &&
                !saving &&
                (state === 'polling' || state === 'retrying')
                ? refreshEvery
                : false
        },
    })
}

/** Forgets every run's failed refreshes: for tests, which share this module. */
export function forgetRefreshFailures(): void {
    failures.clear()
}

/** Asks for the run again now and, if refreshing had stopped, lets it go on. */
export function useRetryRefresh(id: string): () => void {
    const queryClient = useQueryClient()

    return () => {
        failures.delete(id)
        void queryClient.refetchQueries({ queryKey: traceKeys.detail(id) })
    }
}
