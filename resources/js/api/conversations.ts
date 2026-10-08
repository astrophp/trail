import { apiRequest } from '@/api/client'
import type { ConversationListResponse } from '@/api/types'
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

/** The query keys of everything about conversations. Every cached list starts with `list`. */
export const conversationKeys = {
    all: ['conversations'] as const,
    list: ['conversations', 'list'] as const,
}
