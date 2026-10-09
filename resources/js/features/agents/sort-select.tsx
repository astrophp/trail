import { defaultAgentSort } from '@/api/agent-list-view'
import { agentSorts, type AgentSort } from '@/api/agents'
import { SelectFilter } from '@/components/patterns/select-filter'
import { cn } from '@/lib/utils'

/** How each sort the API takes reads, field first and then the direction. */
export const sortLabels: Record<AgentSort, string> = {
    name: 'Agent, A to Z',
    '-name': 'Agent, Z to A',
    runs: 'Runs, fewest first',
    '-runs': 'Runs, most first',
    error_rate: 'Error rate, lowest first',
    '-error_rate': 'Error rate, highest first',
    duration: 'Avg duration, fastest first',
    '-duration': 'Avg duration, slowest first',
    cost: 'Est. cost, lowest first',
    '-cost': 'Est. cost, highest first',
    last_activity: 'Last activity, oldest first',
    '-last_activity': 'Last activity, newest first',
}

type SortSelectProps = {
    /** The sort the list has, from the URL. */
    value: AgentSort
    onValueChange: (sort: AgentSort) => void
    className?: string
}

/**
 * Chooses the list's sort, the way the table's headers do, for the widths at which a sortable
 * column is not there to be clicked (below the roomiest breakpoint). It is the headers' own
 * state, so it always shows the sort the list has, however it was chosen. It is a `SelectFilter`
 * whose "all" stands for the default sort, since a list is always sorted.
 */
export function SortSelect({
    value,
    onValueChange,
    className,
}: SortSelectProps) {
    return (
        <div
            data-slot="sort-select"
            // Where every sortable column has its header, the headers are the way to sort.
            className={cn('flex items-center gap-2 roomy:hidden', className)}
        >
            <span
                aria-hidden="true"
                className="text-caption text-muted-foreground"
            >
                Sort by
            </span>
            <SelectFilter
                value={value === defaultAgentSort ? null : value}
                onValueChange={(next) =>
                    onValueChange(
                        agentSorts.find((sort) => sort === next) ??
                            defaultAgentSort,
                    )
                }
                options={agentSorts
                    .filter((sort) => sort !== defaultAgentSort)
                    .map((sort) => ({ value: sort, label: sortLabels[sort] }))}
                allLabel={sortLabels[defaultAgentSort]}
                aria-label="Sort by"
            />
        </div>
    )
}
