import { apiRequest, apiUrl } from '@/api/client'
import type {
    BookmarkResponse,
    Status,
    TraceDetailResponse,
    TraceListResponse,
    TraceNeighboursResponse,
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
    conversation?: string
    bookmarked?: boolean
}

/** What `GET /traces/export` is asked for: a view of the list, or just the given `ids`. */
export type TraceExportParams = TraceListParams & {
    /** Run ids, separated by commas: at most 100. */
    ids?: string
}

/**
 * Where the CSV of a view of the list is, for a link the browser follows (it streams the file
 * itself). The page is no part of the view, so one that is given is left out.
 */
export function traceExportUrl(params: TraceExportParams): string {
    return apiUrl('/traces/export', withoutPage(params))
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
    /** A run's neighbours in one view of the list; the page is no part of the view. */
    neighbours: (id: string, params: TraceListParams) =>
        ['traces', 'neighbours', id, withoutPage(params)] as const,
    /** A run's neighbours among the turns of its own conversation. */
    conversationNeighbours: (id: string) =>
        ['traces', 'neighbours', id, 'conversation'] as const,
    /** The key of every bookmark write, so a reader can tell that one is under way. */
    bookmark: ['bookmark'] as const,
}

/** The parameters of a view of the list: everything but the page, which the neighbours ignore. */
function withoutPage<T extends { page?: number }>(params: T): Omit<T, 'page'> {
    const view = { ...params }
    delete view.page

    return view
}

const tracePath = (id: string) => `/traces/${encodeURIComponent(id)}`

/** One run with its spans, usage breakdown and coverage. Rejects with a 404 `ApiError` for an unknown run. */
export function fetchTrace(
    id: string,
    signal?: AbortSignal,
): Promise<TraceDetailResponse> {
    return apiRequest<TraceDetailResponse>(tracePath(id), { signal })
}

/**
 * The runs listed just before and just after this one in a view of the list (`params` as the list
 * asks for it; the page is left out). Both are `null` when the run is not in the view.
 */
export function fetchNeighbours(
    id: string,
    params: TraceListParams,
    signal?: AbortSignal,
): Promise<TraceNeighboursResponse> {
    return apiRequest<TraceNeighboursResponse>(`${tracePath(id)}/neighbours`, {
        params: withoutPage(params),
        signal,
    })
}

/**
 * The turns just before and after this run in its own conversation, in the order of the
 * transcript. No range, filter or sort is sent: the conversation is whole.
 */
export function fetchConversationNeighbours(
    id: string,
    signal?: AbortSignal,
): Promise<TraceNeighboursResponse> {
    return apiRequest<TraceNeighboursResponse>(`${tracePath(id)}/neighbours`, {
        params: { within: 'conversation' },
        signal,
    })
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
