import { useCallback } from 'react'
import {
    usageFilterKeys,
    usageListParams,
    type UsageListView,
} from '@/api/usage-list-view'
import type { UsageGrouping, UsageSort } from '@/api/usage'
import { useListState } from '@/hooks/use-list-state'
import { useTimeRange } from '@/hooks/use-time-range'

/**
 * The breakdown's view, read from the URL and written to it: the time range, what it groups by,
 * the sort and the page. Changing the grouping or the sort returns to page 1 in the same history
 * entry; a view that is the default is left out of the address.
 */
export function useUsageList() {
    const [range] = useTimeRange()
    const { state, change, setPage } = useListState(
        usageListParams,
        usageFilterKeys,
    )
    const setBy = useCallback((by: UsageGrouping) => change({ by }), [change])
    const setSort = useCallback((sort: UsageSort) => change({ sort }), [change])

    const view: UsageListView = { range, ...state }

    return { ...state, view, setBy, setSort, setPage }
}
