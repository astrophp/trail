import { apiRequest } from '@/api/client'
import type { AttentionResponse, OverviewResponse } from '@/api/types'
import type { TimeRangePreset } from '@/lib/time-range'

/** The summary of a range, of the period before it, and the range cut into buckets. */
export function fetchOverview(
    range: TimeRangePreset,
    signal?: AbortSignal,
): Promise<OverviewResponse> {
    return apiRequest<OverviewResponse>('/overview', {
        params: { range },
        signal,
    })
}

/** What in a range someone should look at, most pressing first, each with the runs behind it. */
export function fetchAttention(
    range: TimeRangePreset,
    signal?: AbortSignal,
): Promise<AttentionResponse> {
    return apiRequest<AttentionResponse>('/overview/attention', {
        params: { range },
        signal,
    })
}

/** The query keys of everything about the overview. */
export const overviewKeys = {
    all: ['overview'] as const,
    range: (range: TimeRangePreset) => ['overview', range] as const,
    attention: (range: TimeRangePreset) =>
        ['overview', 'attention', range] as const,
}
