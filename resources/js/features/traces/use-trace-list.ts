import { useCallback } from 'react'
import type { TraceSort } from '@/api/traces'
import { traceListParams } from '@/features/traces/trace-list-params'
import { useUrlState, type SetUrlState } from '@/hooks/use-url-state'

/**
 * The list's sort and page, read from the URL and written to it. Changing the sort
 * returns to page 1 in the same history entry.
 */
export function useTraceList() {
    const [state, setState] = useUrlState(traceListParams)
    const setSort = useCallback(
        (sort: TraceSort) => setState({ sort, page: 1 }),
        [setState],
    )
    const setPage = useCallback(
        (
            page: number,
            options?: Parameters<SetUrlState<typeof traceListParams>>[1],
        ) => setState({ page }, options),
        [setState],
    )

    return { ...state, setSort, setPage }
}
