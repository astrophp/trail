import { useIsMutating, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { fetchTrace, traceKeys } from '@/api/traces'
import type { Status } from '@/api/types'
import {
    failureLedger,
    keepsAsking,
    maxFailedRefreshes,
    refreshEvery,
    refreshState,
    type Refreshing,
} from '@/lib/refresh-policy'

export { maxFailedRefreshes, refreshEvery, type Refreshing }

/** The failed refreshes in a row, by run. */
const failures = failureLedger()

/** Where a run's refreshing stands; see `refreshState`, which the conversation page follows too. */
export function refreshing(
    status: Status | undefined,
    error: unknown,
    failed: number,
): Refreshing {
    return refreshState(
        status === 'running',
        error instanceof ApiError ? error.status : null,
        failed,
    )
}

/** How many refreshes of the run failed in a row, as of now. */
export const failedRefreshes = (id: string) => failures.count(id)

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

                failures.clear(id)

                return trace
            } catch (error) {
                // A cancelled request is not a failure of the server.
                if (!signal.aborted) {
                    failures.record(id)
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

            return refresh && !saving && keepsAsking(state)
                ? refreshEvery
                : false
        },
    })
}

/** Forgets every run's failed refreshes: for tests, which share this module. */
export function forgetRefreshFailures(): void {
    failures.reset()
}

/** Asks for the run again now and, if refreshing had stopped, lets it go on. */
export function useRetryRefresh(id: string): () => void {
    const queryClient = useQueryClient()

    return () => {
        failures.clear(id)
        void queryClient.refetchQueries({ queryKey: traceKeys.detail(id) })
    }
}
