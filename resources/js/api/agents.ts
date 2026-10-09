import { apiRequest } from '@/api/client'
import type {
    AgentBreakdownResponse,
    AgentListResponse,
    AgentResponse,
} from '@/api/types'
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

/**
 * One agent in depth: its summary, series and what needs a look. `name` is sent as it is, not
 * trimmed: it can start or end with a space and hold a slash, a percent sign or a plus. Rejects
 * with a 404 `ApiError` for a name that was never recorded.
 */
export function fetchAgent(
    name: string,
    range: TimeRangePreset,
    signal?: AbortSignal,
): Promise<AgentResponse> {
    return apiRequest<AgentResponse>('/agents/show', {
        params: { name, range },
        signal,
    })
}

/** The models and tools of one agent's runs. It is a request of its own: it reads every span of the agent. */
export function fetchAgentBreakdown(
    name: string,
    range: TimeRangePreset,
    signal?: AbortSignal,
): Promise<AgentBreakdownResponse> {
    return apiRequest<AgentBreakdownResponse>('/agents/breakdown', {
        params: { name, range },
        signal,
    })
}

/**
 * The query keys of everything about agents. Every cached list starts with `list`, and one
 * agent's answers are keyed by its name, then its range.
 */
export const agentKeys = {
    all: ['agents'] as const,
    list: ['agents', 'list'] as const,
    show: (name: string, range: TimeRangePreset) =>
        ['agents', 'show', name, range] as const,
    breakdown: (name: string, range: TimeRangePreset) =>
        ['agents', 'breakdown', name, range] as const,
}
