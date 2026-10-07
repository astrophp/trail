import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchTraces, type TraceListParams } from '@/api/traces'
import type { TraceSort } from '@/api/traces'
import type { TimeRangePreset } from '@/lib/time-range'
import type { StatusFilter } from '@/features/traces/trace-status'

/** Everything that decides which runs the list shows. An empty filter is no filter. */
export type TraceView = {
    range: TimeRangePreset
    sort: TraceSort
    page: number
    status: StatusFilter
    search: string
    agent: string
    provider: string
    bookmarked: boolean
}

/** Every cached list starts with this; the view follows. */
export const traceListKey = ['traces', 'list'] as const

/** What to ask the API for: filters left at "all" are not sent. */
function toParams(view: TraceView): TraceListParams {
    return {
        range: view.range,
        sort: view.sort,
        page: view.page,
        status: view.status === 'all' ? undefined : view.status,
        search: view.search,
        agent: view.agent,
        provider: view.provider,
        bookmarked: view.bookmarked,
    }
}

/**
 * The runs for a view. The previous view's response stays as placeholder data until the
 * next one arrives, so a caller must check `isPlaceholderData` before treating it as the answer.
 */
export function useTraces(view: TraceView) {
    return useQuery({
        queryKey: [...traceListKey, view],
        queryFn: ({ signal }) => fetchTraces(toParams(view), signal),
        placeholderData: keepPreviousData,
    })
}
