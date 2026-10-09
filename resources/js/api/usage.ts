import { apiRequest, apiUrl } from '@/api/client'
import type {
    UsageBreakdownResponse,
    UsageResponse,
    UsageSpendResponse,
} from '@/api/types'
import type { TimeRangePreset } from '@/lib/time-range'

/** What the breakdown groups the usage by, as `by` spells it. */
export const usageGroupings = ['model', 'agent', 'provider'] as const

export type UsageGrouping = (typeof usageGroupings)[number]

/** The values `sort` takes on `GET /usage/breakdown`; a leading `-` sorts descending. */
export const usageSorts = [
    'name',
    '-name',
    'tokens',
    '-tokens',
    'runs',
    '-runs',
    'cost',
    '-cost',
] as const

export type UsageSort = (typeof usageSorts)[number]

/** What the breakdown endpoint is asked for. */
export type UsageBreakdownParams = {
    range: TimeRangePreset
    by: UsageGrouping
    sort: UsageSort
    page: number
    per_page?: number
}

/** The totals of a range: its runs' summary, and how much of the usage could be priced. */
export function fetchUsage(
    range: TimeRangePreset,
    signal?: AbortSignal,
): Promise<UsageResponse> {
    return apiRequest<UsageResponse>('/usage', { params: { range }, signal })
}

/** The usage of a range by model, top-level agent or provider, sorted and paged by the server. */
export function fetchUsageBreakdown(
    params: UsageBreakdownParams,
    signal?: AbortSignal,
): Promise<UsageBreakdownResponse> {
    return apiRequest<UsageBreakdownResponse>('/usage/breakdown', {
        params,
        signal,
    })
}

/** The estimated cost of each bucket of a range, and the projection of the next period. */
export function fetchUsageSpend(
    range: TimeRangePreset,
    signal?: AbortSignal,
): Promise<UsageSpendResponse> {
    return apiRequest<UsageSpendResponse>('/usage/spend', {
        params: { range },
        signal,
    })
}

/** The time range of an export: a preset ending now, or both ends of an explicit range. */
export type UsageExportRange =
    { range: TimeRangePreset } | { from: string; to: string }

/**
 * Where the CSV of the breakdown is, for a link the browser follows (it streams the file itself):
 * the view's range, grouping and sort, every page of it. The page is no part of the view.
 */
export function usageExportUrl(
    view: UsageExportRange & { by: UsageGrouping; sort: UsageSort },
): string {
    return apiUrl('/usage/export', view)
}

/** Where the CSV of the estimated cost series and its projection is, for a link the browser follows. */
export function usageSpendExportUrl(range: UsageExportRange): string {
    return apiUrl('/usage/spend/export', range)
}

/** The query keys of everything about usage. A breakdown is keyed by what it groups by, then the range. */
export const usageKeys = {
    all: ['usage'] as const,
    range: (range: TimeRangePreset) => ['usage', 'totals', range] as const,
    spend: (range: TimeRangePreset) => ['usage', 'spend', range] as const,
    breakdown: (view: UsageBreakdownParams) =>
        [
            'usage',
            'breakdown',
            view.by,
            view.range,
            view.sort,
            view.page,
        ] as const,
}
