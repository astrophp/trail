import { apiRequest } from '@/api/client'
import type { TraceListResponse } from '@/api/types'
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
 * What the list endpoint is asked for. Only the range is required; the filters
 * the endpoint also takes are added here as optional fields.
 */
export type TraceListParams = {
    range: TimeRangePreset
    sort?: TraceSort
    page?: number
}

export function fetchTraces(
    params: TraceListParams,
    signal?: AbortSignal,
): Promise<TraceListResponse> {
    return apiRequest<TraceListResponse>('/traces', { params, signal })
}
