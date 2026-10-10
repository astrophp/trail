import { apiRequest } from '@/api/client'
import type { MetaResponse, TimeRangePreset } from '@/api/types'

export function fetchMeta(
    range: TimeRangePreset,
    signal?: AbortSignal,
): Promise<MetaResponse> {
    return apiRequest<MetaResponse>('/meta', { params: { range }, signal })
}
