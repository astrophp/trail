import { agentSorts, type AgentListParams, type AgentSort } from '@/api/agents'
import { searchParam } from '@/lib/search'
import type { TimeRangePreset } from '@/lib/time-range'
import { enumParam, intParam } from '@/lib/url-state'

export const defaultAgentSort: AgentSort = '-runs'

/** What the list keeps in the URL besides the time range. The names are the API's own. */
export const agentListParams = {
    sort: enumParam(agentSorts, defaultAgentSort),
    page: intParam(1, { min: 1 }),
    search: searchParam,
}

/** The params that are filters: changing any of them starts a new result list on page 1. */
export const agentFilterKeys = [
    'search',
] as const satisfies readonly (keyof typeof agentListParams)[]

/** Everything that decides which agents the list shows. An empty search is no search. */
export type AgentListView = {
    range: TimeRangePreset
    sort: AgentSort
    page: number
    search: string
}

/** What to ask the API for. `perPage` is left out for the endpoint's own page size. */
export function agentListApiParams(
    view: AgentListView,
    perPage?: number,
): AgentListParams {
    return {
        range: view.range,
        sort: view.sort,
        page: view.page,
        per_page: perPage,
        search: view.search,
    }
}
