import {
    usageGroupings,
    usageSorts,
    type UsageBreakdownParams,
    type UsageGrouping,
    type UsageSort,
} from '@/api/usage'
import type { TimeRangePreset } from '@/lib/time-range'
import { enumParam, intParam } from '@/lib/url-state'

export const defaultUsageSort: UsageSort = '-cost'

/** What the breakdown keeps in the URL besides the time range. The names are the API's own. */
export const usageListParams = {
    by: enumParam(usageGroupings, 'model'),
    sort: enumParam(usageSorts, defaultUsageSort),
    page: intParam(1, { min: 1 }),
}

/** The params that change which rows there are: changing any of them starts on page 1. */
export const usageFilterKeys = [
    'by',
] as const satisfies readonly (keyof typeof usageListParams)[]

/** Everything that decides which rows the breakdown shows. */
export type UsageListView = {
    range: TimeRangePreset
    by: UsageGrouping
    sort: UsageSort
    page: number
}

/** What to ask the API for: the endpoint's own page size is used. */
export function usageApiParams(view: UsageListView): UsageBreakdownParams {
    return { range: view.range, by: view.by, sort: view.sort, page: view.page }
}
