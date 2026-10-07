import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchTraces, type TraceListParams } from '@/api/traces'

/**
 * The runs for a view. The previous view's response stays as placeholder data until the
 * next one arrives, so a caller must check `isPlaceholderData` before treating it as the answer.
 */
export function useTraces(view: Required<TraceListParams>) {
    const { range, sort, page } = view

    return useQuery({
        queryKey: ['traces', range, sort, page],
        queryFn: ({ signal }) => fetchTraces({ range, sort, page }, signal),
        placeholderData: keepPreviousData,
    })
}
