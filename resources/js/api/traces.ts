import { apiRequest } from '@/api/client'
import type {
    BookmarkResponse,
    Status,
    TraceDetailResponse,
    TraceListResponse,
} from '@/api/types'
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

/**
 * The query keys of everything about runs, shared by the features that read or write them.
 * Every cached list starts with `list`, every cached run with `detail(id)`.
 */
export const traceKeys = {
    all: ['traces'] as const,
    list: ['traces', 'list'] as const,
    detail: (id: string) => ['traces', 'detail', id] as const,
}

const tracePath = (id: string) => `/traces/${encodeURIComponent(id)}`

/** One run with its spans, usage breakdown and coverage. Rejects with a 404 `ApiError` for an unknown run. */
export function fetchTrace(
    id: string,
    signal?: AbortSignal,
): Promise<TraceDetailResponse> {
    return apiRequest<TraceDetailResponse>(tracePath(id), { signal })
}

const bookmarkPath = (id: string) => `${tracePath(id)}/bookmark`

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
