import type { Status, StatusCounts } from '@/api/types'
import type { CountTab } from '@/components/patterns/count-tabs'
import { statusLabel } from '@/components/telemetry/status-badge'

/** The status tabs in the order they are shown, after "All traces". */
const statusOrder = [
    'completed',
    'failed',
    'incomplete',
    'running',
    'awaiting_approval',
] as const satisfies readonly Status[]

/** Which runs a view shows: all of them, or those with one status. */
export const statusFilters = ['all', ...statusOrder] as const

export type StatusFilter = (typeof statusFilters)[number]

/** The tab (or chip) text for a status filter. */
export function statusFilterLabel(filter: StatusFilter): string {
    return filter === 'all' ? 'All traces' : statusLabel(filter)
}

/** The tabs, each with the API's count for it; no count while `counts` is unknown. */
export function statusTabs(counts: StatusCounts | undefined): CountTab[] {
    return statusFilters.map((filter) => ({
        value: filter,
        label: statusFilterLabel(filter),
        count: counts?.[filter],
    }))
}
