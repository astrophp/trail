import { useCallback } from 'react'
import {
    agentFilterKeys,
    agentListParams,
    type AgentListView,
} from '@/api/agent-list-view'
import type { AgentSort } from '@/api/agents'
import { useListState } from '@/hooks/use-list-state'
import { useTimeRange } from '@/hooks/use-time-range'

/**
 * The list's view, read from the URL and written to it: the time range, sort, page and search.
 * Changing the sort or the search returns to page 1 in the same history entry. Pass `replace` to
 * the search setter for changes made while typing.
 */
export function useAgentList() {
    const [range] = useTimeRange()
    const { state, change, setPage, clearAll } = useListState(
        agentListParams,
        agentFilterKeys,
    )
    const setSort = useCallback((sort: AgentSort) => change({ sort }), [change])
    const setSearch = useCallback(
        (search: string, options?: { replace?: boolean }) =>
            change({ search }, options),
        [change],
    )

    const view: AgentListView = { range, ...state }

    return {
        ...state,
        view,
        hasFilters: state.search !== '',
        setSort,
        setPage,
        setSearch,
        clearAll,
    }
}
