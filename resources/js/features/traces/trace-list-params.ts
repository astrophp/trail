import { traceSorts } from '@/api/traces'
import { defaultTraceSort } from '@/features/traces/trace-sort'
import { statusFilters } from '@/features/traces/trace-status'
import {
    boolParam,
    enumParam,
    intParam,
    stringParam,
    type Param,
} from '@/lib/url-state'

/** The API takes at most this many characters of a search. */
const searchLength = 200

/** What a search means: without the spaces around it, and no longer than the API reads. */
export function normalizeSearch(text: string): string {
    return text.trim().slice(0, searchLength)
}

const searchParam: Param<string> = {
    ...stringParam(),
    parse: normalizeSearch,
}

/**
 * What the list keeps in the URL besides the time range. The names are the API's own
 * (`status`, `search`, `agent`, `provider`, `bookmarked`, `sort`, `page`); an empty
 * `agent` or `provider` means all.
 */
export const traceListParams = {
    sort: enumParam(traceSorts, defaultTraceSort),
    page: intParam(1, { min: 1 }),
    status: enumParam(statusFilters, 'all'),
    search: searchParam,
    agent: stringParam(),
    provider: stringParam(),
    bookmarked: boolParam(),
}

/** The params that are filters: changing any of them starts a new result list on page 1. */
export const traceFilterKeys = [
    'status',
    'search',
    'agent',
    'provider',
    'bookmarked',
] as const satisfies readonly (keyof typeof traceListParams)[]

export type TraceFilterKey = (typeof traceFilterKeys)[number]
