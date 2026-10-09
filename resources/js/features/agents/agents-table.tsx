import { useMemo, type ReactNode } from 'react'
import { agentSorts, type AgentSort } from '@/api/agents'
import type { Agent } from '@/api/types'
import { DataTable } from '@/components/patterns/data-table'
import { agentColumns } from '@/features/agents/agent-columns'
import type { TimeRangePreset } from '@/lib/time-range'
import { toApiSort, toTableSort } from '@/lib/table-sort'

const getRowId = (agent: Agent) => agent.name

type AgentsTableProps = {
    agents: Agent[]
    /** The range the agents were counted over, which is not the URL's while a new range loads. */
    range: TimeRangePreset
    /** The list the rows are shown in, as a `from` value; the rows lead back to it. */
    from?: string
    /** The sort the rows came in. */
    sort: AgentSort
    /** Makes the headers sort. Left out, the table is not sortable: its order is fixed. */
    onSortChange?: (sort: AgentSort) => void
    caption: string
    loading?: boolean
    skeletonRows?: number
    busy?: boolean
    empty?: ReactNode
    footer?: ReactNode
    className?: string
}

/**
 * The agents of a range, one row each: the table of the Agents page and of the Overview's agent
 * performance panel. The rows come sorted and paged by the server; with `onSortChange` the
 * headers sort, without it they are only labels.
 */
export function AgentsTable({
    agents,
    range,
    from,
    sort,
    onSortChange,
    caption,
    loading,
    skeletonRows,
    busy,
    empty,
    footer,
    className,
}: AgentsTableProps) {
    const sortable = onSortChange !== undefined
    const columns = useMemo(
        () => agentColumns({ range, from, sortable }),
        [range, from, sortable],
    )

    return (
        <DataTable
            loading={loading}
            skeletonRows={skeletonRows}
            busy={busy}
            columns={columns}
            data={agents}
            getRowId={getRowId}
            sort={toTableSort(sort)}
            onSortChange={(next) => onSortChange?.(toApiSort(agentSorts, next))}
            caption={caption}
            empty={empty}
            footer={footer}
            className={className}
        />
    )
}
