import { useCallback } from 'react'
import type { TraceSort } from '@/api/traces'
import {
    traceFilterKeys,
    traceListParams,
    type TraceFilterKey,
} from '@/features/traces/trace-list-params'
import {
    statusFilterLabel,
    type StatusFilter,
} from '@/features/traces/trace-status'
import type { TraceView } from '@/features/traces/use-traces'
import { useUrlState, type SetUrlState } from '@/hooks/use-url-state'
import { useTimeRange } from '@/hooks/use-time-range'

type WriteOptions = Parameters<SetUrlState<typeof traceListParams>>[1]

/**
 * The list's view, read from the URL and written to it: the time range, sort, page and filters.
 * Changing the sort or any filter returns to page 1 in the same history entry. Pass `replace`
 * to a filter's setter for changes made while typing.
 */
export function useTraceList() {
    const [range] = useTimeRange()
    const [state, setState] = useUrlState(traceListParams)
    const setSort = useCallback(
        (sort: TraceSort) => setState({ sort, page: 1 }),
        [setState],
    )
    const setPage = useCallback(
        (page: number, options?: WriteOptions) => setState({ page }, options),
        [setState],
    )
    const setStatus = useCallback(
        (status: StatusFilter) => setState({ status, page: 1 }),
        [setState],
    )
    const setSearch = useCallback(
        (search: string, options?: WriteOptions) =>
            setState({ search, page: 1 }, options),
        [setState],
    )
    const setAgent = useCallback(
        (agent: string) => setState({ agent, page: 1 }),
        [setState],
    )
    const setProvider = useCallback(
        (provider: string) => setState({ provider, page: 1 }),
        [setState],
    )
    const setBookmarked = useCallback(
        (bookmarked: boolean) => setState({ bookmarked, page: 1 }),
        [setState],
    )
    /** Puts the given filters back to "no filter", and the list back on page 1: one history entry. */
    const clear = useCallback(
        (keys: TraceFilterKey[]) =>
            setState({
                ...Object.fromEntries(
                    keys.map((key) => [key, traceListParams[key].default]),
                ),
                page: 1,
            }),
        [setState],
    )

    const clearAll = useCallback(() => clear([...traceFilterKeys]), [clear])

    const view: TraceView = { range, ...state }
    // The filters that are on, in one place: the chips show them and `hasFilters` follows.
    const activeFilters: { key: TraceFilterKey; label: string }[] = []

    if (state.status !== 'all') {
        activeFilters.push({
            key: 'status',
            label: `Status: ${statusFilterLabel(state.status)}`,
        })
    }

    if (state.search !== '') {
        activeFilters.push({ key: 'search', label: `Search: ${state.search}` })
    }

    if (state.agent !== '') {
        activeFilters.push({ key: 'agent', label: `Agent: ${state.agent}` })
    }

    if (state.provider !== '') {
        activeFilters.push({
            key: 'provider',
            label: `Provider: ${state.provider}`,
        })
    }

    if (state.bookmarked) {
        activeFilters.push({ key: 'bookmarked', label: 'Bookmarked' })
    }

    return {
        ...state,
        view,
        activeFilters,
        hasFilters: activeFilters.length > 0,
        setSort,
        setPage,
        setStatus,
        setSearch,
        setAgent,
        setProvider,
        setBookmarked,
        clear,
        clearAll,
    }
}
