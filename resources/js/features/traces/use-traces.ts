import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { traceListApiParams, type TraceListView } from '@/api/trace-list-view'
import { fetchTraces, traceKeys } from '@/api/traces'

/**
 * The runs for a view. The previous view's response stays as placeholder data until the
 * next one arrives, so a caller must check `isPlaceholderData` before treating it as the answer.
 */
export function useTraces(view: TraceListView) {
    return useQuery({
        queryKey: [...traceKeys.list, view],
        queryFn: ({ signal }) => fetchTraces(traceListApiParams(view), signal),
        placeholderData: keepPreviousData,
    })
}
