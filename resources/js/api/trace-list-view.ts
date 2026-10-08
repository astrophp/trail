import { traceSorts, type TraceListParams, type TraceSort } from '@/api/traces'
import type { Status } from '@/api/types'
import { searchParam } from '@/lib/search'
import { timeRangeParam, type TimeRangePreset } from '@/lib/time-range'
import {
    boolParam,
    enumParam,
    intParam,
    readState,
    stringParam,
} from '@/lib/url-state'

/** The status tabs in the order they are shown, after "All traces". */
const statusOrder = [
    'completed',
    'failed',
    'incomplete',
    'running',
    'awaiting_approval',
] as const satisfies readonly Status[]

/** Which runs a view shows: all of them, or those with one status. */
export const statusFilters = ['all', ...statusOrder] as const

export type StatusFilter = (typeof statusFilters)[number]

export const defaultTraceSort: TraceSort = '-started_at'

/**
 * What the list keeps in the URL besides the time range. The names are the API's own
 * (`status`, `search`, `agent`, `provider`, `conversation`, `bookmarked`, `slow`, `sort`, `page`); an empty
 * `agent`, `provider` or `conversation` means all.
 */
export const traceListParams = {
    sort: enumParam(traceSorts, defaultTraceSort),
    page: intParam(1, { min: 1 }),
    status: enumParam(statusFilters, 'all'),
    search: searchParam,
    agent: stringParam(),
    provider: stringParam(),
    conversation: stringParam(),
    bookmarked: boolParam(),
    slow: boolParam(),
}

/** The params that are filters: changing any of them starts a new result list on page 1. */
export const traceFilterKeys = [
    'status',
    'search',
    'agent',
    'provider',
    'conversation',
    'bookmarked',
    'slow',
] as const satisfies readonly (keyof typeof traceListParams)[]

export type TraceFilterKey = (typeof traceFilterKeys)[number]

/** Everything that decides which runs the list shows. An empty filter is no filter. */
export type TraceListView = {
    range: TimeRangePreset
    sort: TraceSort
    page: number
    status: StatusFilter
    search: string
    agent: string
    provider: string
    conversation: string
    bookmarked: boolean
    slow: boolean
}

/** The list view a query string describes; a missing or invalid value is the list's default. */
export function readTraceListView(search: URLSearchParams): TraceListView {
    return {
        range: readState({ range: timeRangeParam }, search).range,
        ...readState(traceListParams, search),
    }
}

/** What to ask the API for: filters left at "all" are not sent. */
export function traceListApiParams(view: TraceListView): TraceListParams {
    return {
        range: view.range,
        sort: view.sort,
        page: view.page,
        status: view.status === 'all' ? undefined : view.status,
        search: view.search,
        agent: view.agent,
        provider: view.provider,
        conversation: view.conversation,
        bookmarked: view.bookmarked,
        slow: view.slow,
    }
}
