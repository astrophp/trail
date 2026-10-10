import { apiRequest } from '@/api/client'
import type { ConversationListResponse, TranscriptResponse } from '@/api/types'
import type { TimeRangePreset } from '@/lib/time-range'

/** The values `sort` takes on `GET /conversations`; a leading `-` sorts descending. */
export const conversationSorts = [
    'last_activity',
    '-last_activity',
    'turns',
    '-turns',
    'cost',
    '-cost',
] as const

export type ConversationSort = (typeof conversationSorts)[number]

/**
 * What the list endpoint is asked for. Only the range is required. An unset filter is not sent;
 * `failed: false` is not sent either.
 */
export type ConversationListParams = {
    range: TimeRangePreset
    sort?: ConversationSort
    page?: number
    search?: string
    agent?: string
    failed?: boolean
}

export function fetchConversations(
    params: ConversationListParams,
    signal?: AbortSignal,
): Promise<ConversationListResponse> {
    return apiRequest<ConversationListResponse>('/conversations', {
        params,
        signal,
    })
}

/**
 * What the transcript endpoint is asked for. At most one of `turn`, `before` and `after` (a run's
 * id) is sent: `turn` ends the window at that run, `before` and `after` take the turns just
 * before or after it. `limit` is how many turns (the endpoint's default and most is 10).
 */
export type TranscriptParams = {
    id: string
    turn?: string
    before?: string
    after?: string
    limit?: number
}

/**
 * A window of one conversation's turns, oldest first: the newest ones, or the ones an anchor
 * chooses. The id is any string the host application chose and travels in the query. Rejects with
 * a 404 `ApiError` for a conversation with no turns.
 */
export function fetchTranscript(
    params: TranscriptParams,
    signal?: AbortSignal,
): Promise<TranscriptResponse> {
    return apiRequest<TranscriptResponse>('/conversations/transcript', {
        params,
        signal,
    })
}

/** The query keys of everything about conversations. Every cached list starts with `list`. */
export const conversationKeys = {
    all: ['conversations'] as const,
    list: ['conversations', 'list'] as const,
    /**
     * One conversation's transcript as a page was opened on it: at the turn the address named (the
     * newest turns when `anchor` is empty). The windows loaded since are part of the data.
     */
    transcript: (id: string, anchor = '') =>
        ['conversations', 'transcript', id, anchor] as const,
}
