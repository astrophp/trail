import { useMutation, useQueryClient } from '@tanstack/react-query'
import { bookmarkTrace, unbookmarkTrace } from '@/api/traces'
import type { TraceListResponse } from '@/api/types'
import { notify } from '@/components/patterns/notify'
import { traceListKey } from '@/features/traces/use-traces'

const mutationKey = ['bookmark'] as const

/** Runs whose presses overlapped: what to show after a failure is not known for them. */
const overlapped = new Set<string>()

/**
 * Bookmarks and un-bookmarks one run. The press shows at once in every cached list that holds the
 * run, and the server has the last word: the screen never shows a state the server does not have.
 *
 * - Presses on one run are sent one after the other, in the order made, so the server ends in the
 *   state of the last press. A response never writes to the lists.
 * - A failed press is undone at once only when it is the run's only press in flight and none
 *   overlapped it before: then the state before the press is known. Otherwise nothing is guessed.
 *   Either way a toast says it failed.
 * - When the last pending bookmark write settles, whatever happened, every trace list is fetched
 *   again. That corrects a list a refetch overwrote with the old state between the press and the
 *   response, an overlapped failure, and the lists of bookmarked runs (a run un-bookmarked there
 *   stays on screen until then).
 */
export function useBookmark(traceId: string) {
    const queryClient = useQueryClient()
    const scope = `bookmark:${traceId}`
    const pressesOnRun = () =>
        queryClient.isMutating({
            mutationKey,
            predicate: (mutation) => mutation.options.scope?.id === scope,
        })

    const show = (bookmarked: boolean) =>
        queryClient.setQueriesData<TraceListResponse>(
            { queryKey: traceListKey },
            (list) =>
                list?.data.some((trace) => trace.id === traceId)
                    ? {
                          ...list,
                          data: list.data.map((trace) =>
                              trace.id === traceId
                                  ? { ...trace, bookmarked }
                                  : trace,
                          ),
                      }
                    : list,
        )

    const { mutate } = useMutation({
        mutationKey,
        scope: { id: scope },
        mutationFn: (bookmarked: boolean) =>
            bookmarked ? bookmarkTrace(traceId) : unbookmarkTrace(traceId),
        onMutate: async (bookmarked) => {
            // This press is already pending when `onMutate` runs, so it is counted: more is an overlap.
            if (pressesOnRun() > 1) {
                overlapped.add(traceId)
            }

            // A fetch under way may carry the state from before this press. Only lists that have
            // rows are cancelled: cancelling a first load would leave it with nothing to show.
            await queryClient.cancelQueries({
                queryKey: traceListKey,
                predicate: (query) => query.state.data !== undefined,
            })
            show(bookmarked)
        },
        onError: (_error, bookmarked) => {
            // This press is still pending here, so it is counted.
            if (pressesOnRun() <= 1 && !overlapped.has(traceId)) {
                show(!bookmarked)
            }

            notify.error('The bookmark could not be saved.')
        },
        onSettled: () => {
            if (pressesOnRun() <= 1) {
                overlapped.delete(traceId)
            }

            if (queryClient.isMutating({ mutationKey }) <= 1) {
                void queryClient.invalidateQueries({ queryKey: traceListKey })
            }
        },
    })

    return mutate
}
