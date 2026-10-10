import { statusFilters, type StatusFilter } from '@/api/trace-list-view'
import type { StatusCounts } from '@/api/types'
import type { CountTab } from '@/components/patterns/count-tabs'
import { statusLabel } from '@/components/telemetry/status-badge'

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
