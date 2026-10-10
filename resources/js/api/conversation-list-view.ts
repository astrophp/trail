import {
    conversationSorts,
    type ConversationListParams,
    type ConversationSort,
} from '@/api/conversations'
import { searchParam } from '@/lib/search'
import { timeRangeParam, type TimeRangePreset } from '@/lib/time-range'
import {
    boolParam,
    enumParam,
    intParam,
    readState,
    stringParam,
} from '@/lib/url-state'

export const defaultConversationSort: ConversationSort = '-last_activity'

/**
 * What the list keeps in the URL besides the time range. The names are the API's own (`sort`,
 * `page`, `search`, `agent`, `failed`); an empty `agent` means all.
 */
export const conversationListParams = {
    sort: enumParam(conversationSorts, defaultConversationSort),
    page: intParam(1, { min: 1 }),
    search: searchParam,
    agent: stringParam(),
    failed: boolParam(),
}

/** The params that are filters: changing any of them starts a new result list on page 1. */
export const conversationFilterKeys = [
    'search',
    'agent',
    'failed',
] as const satisfies readonly (keyof typeof conversationListParams)[]

export type ConversationFilterKey = (typeof conversationFilterKeys)[number]

/** Everything that decides which conversations the list shows. An empty filter is no filter. */
export type ConversationListView = {
    range: TimeRangePreset
    sort: ConversationSort
    page: number
    search: string
    agent: string
    failed: boolean
}

/** The list view a query string describes; a missing or invalid value is the list's default. */
export function readConversationListView(
    search: URLSearchParams,
): ConversationListView {
    return {
        range: readState({ range: timeRangeParam }, search).range,
        ...readState(conversationListParams, search),
    }
}

/** What to ask the API for. The client leaves out an empty search, no agent and `failed: false`. */
export function conversationListApiParams(
    view: ConversationListView,
): ConversationListParams {
    return {
        range: view.range,
        sort: view.sort,
        page: view.page,
        search: view.search,
        agent: view.agent,
        failed: view.failed,
    }
}
