import { apiRequest } from '@/api/client'
import type { BookmarkResponse, Status, TraceListResponse } from '@/api/types'
import type { TimeRangePreset } from '@/lib/time-range'

/** The values `sort` takes on `GET /traces`; a leading `-` sorts descending. */
export const traceSorts = [
    'started_at',
    '-started_at',
    'duration',
    '-duration',
    'cost',
    '-cost',
    'agent',
    '-agent',
] as const

export type TraceSort = (typeof traceSorts)[number]

/**
 * What the list endpoint is asked for. Only the range is required. An unset filter is not
 * sent; `bookmarked: false` is not sent either.
 */
export type TraceListParams = {
    range: TimeRangePreset
    sort?: TraceSort
    page?: number
    status?: Status
    search?: string
    agent?: string
    provider?: string
    bookmarked?: boolean
}

export function fetchTraces(
    params: TraceListParams,
    signal?: AbortSignal,
): Promise<TraceListResponse> {
    return apiRequest<TraceListResponse>('/traces', { params, signal })
}

const bookmarkPath = (id: string) =>
    `/traces/${encodeURIComponent(id)}/bookmark`

/** Bookmarks a run. Idempotent: answers `bookmarked: true` whether or not it was already. */
export function bookmarkTrace(id: string): Promise<BookmarkResponse> {
    return apiRequest<BookmarkResponse>(bookmarkPath(id), { method: 'PUT' })
}

/** Removes a run's bookmark. Idempotent: answers `bookmarked: false` whether or not it was there. */
export function unbookmarkTrace(id: string): Promise<BookmarkResponse> {
    return apiRequest<BookmarkResponse>(bookmarkPath(id), {
        method: 'DELETE',
    })
}
