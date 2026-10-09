import { apiRequest } from '@/api/client'
import type { AgentListResponse } from '@/api/types'
import type { TimeRangePreset } from '@/lib/time-range'

/** The values `sort` takes on `GET /agents`; a leading `-` sorts descending. */
export const agentSorts = [
    'name',
    '-name',
    'runs',
    '-runs',
    'error_rate',
    '-error_rate',
    'duration',
    '-duration',
    'cost',
    '-cost',
    'last_activity',
    '-last_activity',
] as const

export type AgentSort = (typeof agentSorts)[number]

/** What the list endpoint is asked for. Only the range is required; an empty search is not sent. */
export type AgentListParams = {
    range: TimeRangePreset
    sort?: AgentSort
    page?: number
    per_page?: number
    search?: string
}

/** The agents that ran in a range, with their figures, sorted and paged by the server. */
export function fetchAgents(
    params: AgentListParams,
    signal?: AbortSignal,
): Promise<AgentListResponse> {
    return apiRequest<AgentListResponse>('/agents', { params, signal })
}

/** The query keys of everything about agents. Every cached list starts with `list`. */
export const agentKeys = {
    all: ['agents'] as const,
    list: ['agents', 'list'] as const,
}
