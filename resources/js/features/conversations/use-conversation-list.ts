import { useCallback } from 'react'
import {
    conversationFilterKeys,
    conversationListParams,
    type ConversationFilterKey,
    type ConversationListView,
} from '@/api/conversation-list-view'
import type { ConversationSort } from '@/api/conversations'
import { useListState } from '@/hooks/use-list-state'
import { useTimeRange } from '@/hooks/use-time-range'

/**
 * The list's view, read from the URL and written to it: the time range, sort, page and filters.
 * Changing the sort or any filter returns to page 1 in the same history entry. Pass `replace`
 * to the search setter for changes made while typing.
 */
export function useConversationList() {
    const [range] = useTimeRange()
    const { state, change, setPage, clear, clearAll } = useListState(
        conversationListParams,
        conversationFilterKeys,
    )
    const setSort = useCallback(
        (sort: ConversationSort) => change({ sort }),
        [change],
    )
    const setFailed = useCallback(
        (failed: boolean) => change({ failed }),
        [change],
    )
    const setSearch = useCallback(
        (search: string, options?: { replace?: boolean }) =>
            change({ search }, options),
        [change],
    )
    const setAgent = useCallback((agent: string) => change({ agent }), [change])

    const view: ConversationListView = { range, ...state }
    // The filters shown as chips. The failures tab is a tab, not a chip, but it is a filter all
    // the same: `hasFilters` counts it, so an empty "With failures" is "no match", not "no data".
    const activeFilters: { key: ConversationFilterKey; label: string }[] = []

    if (state.search !== '') {
        activeFilters.push({ key: 'search', label: `Search: ${state.search}` })
    }

    if (state.agent !== '') {
        activeFilters.push({ key: 'agent', label: `Agent: ${state.agent}` })
    }

    return {
        ...state,
        view,
        activeFilters,
        hasFilters: activeFilters.length > 0 || state.failed,
        setSort,
        setPage,
        setFailed,
        setSearch,
        setAgent,
        clear,
        clearAll,
    }
}
