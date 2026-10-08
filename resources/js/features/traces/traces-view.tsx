import { useRef } from 'react'
import type { StatusFilter } from '@/api/trace-list-view'
import { CountTabs } from '@/components/patterns/count-tabs'
import { TraceFilterChips } from '@/features/traces/trace-filter-chips'
import { TraceFilters } from '@/features/traces/trace-filters'
import { statusTabs } from '@/features/traces/trace-status'
import { TracesTable } from '@/features/traces/traces-table'
import { useTraceList } from '@/features/traces/use-trace-list'
import { useTraces } from '@/features/traces/use-traces'

type TracesViewProps = {
    /** The agents and providers seen in the range, for the filters; `undefined` while unknown. */
    agents: string[] | undefined
    providers: string[] | undefined
    className?: string
}

/**
 * The runs with the ways to narrow them: status tabs with the API's counts, the filter row,
 * the chips of the filters that are on, and the table. Every filter is in the URL.
 */
export function TracesView({ agents, providers, className }: TracesViewProps) {
    const list = useTraceList()
    // The counts of the response the table is showing (the previous one while a refresh runs).
    const { data } = useTraces(list.view)
    const searchRef = useRef<HTMLInputElement>(null)

    return (
        <CountTabs
            aria-label="Filter runs by status"
            tabs={statusTabs(data?.status_counts)}
            value={list.status}
            // The tabs are built from the status filters, so only those come back.
            onValueChange={(status) => list.setStatus(status as StatusFilter)}
            className={className}
            toolbar={
                <div className="flex flex-col gap-4.5 py-4.5">
                    <TraceFilters
                        agents={agents}
                        providers={providers}
                        searchRef={searchRef}
                    />
                    <TraceFilterChips searchRef={searchRef} className="-mb-1" />
                </div>
            }
        >
            <TracesTable searchRef={searchRef} />
        </CountTabs>
    )
}
