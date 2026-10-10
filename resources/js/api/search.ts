import { apiRequest } from '@/api/client'
import type { SearchResponse } from '@/api/types'
import type { TimeRangePreset } from '@/lib/time-range'

/** What the search endpoint is asked for: the text and the time range its text matches are bounded by. */
export type SearchParams = {
    q: string
    range: TimeRangePreset
}

/** The fewest characters the endpoint searches for; a shorter text is answered with nothing read. */
export const searchMinimum = 2

/** The few runs, conversations and agents that match a text. */
export function fetchSearch(
    params: SearchParams,
    signal?: AbortSignal,
): Promise<SearchResponse> {
    return apiRequest<SearchResponse>('/search', { params, signal })
}

/** The query keys of the search. */
export const searchKeys = {
    all: ['search'] as const,
    for: (q: string, range: TimeRangePreset) => ['search', q, range] as const,
}
