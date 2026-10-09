import { useCallback } from 'react'
import type { TraceSort } from '@/api/traces'
import {
    traceFilterKeys,
    traceListParams,
    type StatusFilter,
    type TraceFilterKey,
    type TraceListView,
} from '@/api/trace-list-view'
import { statusFilterLabel } from '@/features/traces/trace-status'
import { useListState } from '@/hooks/use-list-state'
import { useTimeRange } from '@/hooks/use-time-range'
import { conversationIdText } from '@/lib/conversation-id'

/**
 * The list's view, read from the URL and written to it: the time range, sort, page and filters.
 * Changing the sort or any filter returns to page 1 in the same history entry. Pass `replace`
 * to a filter's setter for changes made while typing.
 */
export function useTraceList() {
    const [range] = useTimeRange()
    const { state, change, setPage, clear, clearAll } = useListState(
        traceListParams,
        traceFilterKeys,
    )
    const setSort = useCallback((sort: TraceSort) => change({ sort }), [change])
    const setStatus = useCallback(
        (status: StatusFilter) => change({ status }),
        [change],
    )
    const setSearch = useCallback(
        (search: string, options?: { replace?: boolean }) =>
            change({ search }, options),
        [change],
    )
    const setAgent = useCallback((agent: string) => change({ agent }), [change])
    const setProvider = useCallback(
        (provider: string) => change({ provider }),
        [change],
    )
    const setBookmarked = useCallback(
        (bookmarked: boolean) => change({ bookmarked }),
        [change],
    )

    const view: TraceListView = { range, ...state }
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

    if (state.conversation !== '') {
        activeFilters.push({
            key: 'conversation',
            label: `Conversation: ${conversationIdText(state.conversation)}`,
        })
    }

    if (state.bookmarked) {
        activeFilters.push({ key: 'bookmarked', label: 'Bookmarked' })
    }

    if (state.slow) {
        activeFilters.push({
            key: 'slow',
            label: 'Slow: 95th percentile and above',
        })
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
