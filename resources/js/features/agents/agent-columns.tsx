import type { Agent } from '@/api/types'
import {
    skeletonBarClass,
    type DataTableColumn,
} from '@/components/patterns/data-table'
import { CostValue } from '@/components/telemetry/cost-value'
import { DurationValue } from '@/components/telemetry/duration-value'
import { Timestamp } from '@/components/telemetry/timestamp'
import { Skeleton } from '@/components/ui/skeleton'
import { ActivityCell } from '@/features/agents/activity-cell'
import { AgentCell } from '@/features/agents/agent-cell'
import { ErrorRateCell } from '@/features/agents/error-rate-cell'
import { NotApplicable } from '@/features/agents/not-applicable'
import { RunsCell } from '@/features/agents/runs-cell'
import { agentPath } from '@/lib/agent-path'
import type { TimeRangePreset } from '@/lib/time-range'
import { cn } from '@/lib/utils'

/** How a range finishes the sentence "N runs in …". */
const periods: Record<TimeRangePreset, string> = {
    '1h': 'the last hour',
    '24h': 'the last 24 hours',
    '7d': 'the last 7 days',
}

type AgentColumnsOptions = {
    /** The range the rows were counted over: every link out carries it. */
    range: TimeRangePreset
    /** The list the rows are shown in, as a `from` value; leave it out for a block that is not a list page. */
    from?: string
    /** Whether the headers sort. The id of a sortable column is the API's name for its `sort`. */
    sortable: boolean
}

// The columns are dropped so the table never has to scroll sideways at a width the page offers it:
// the sidebar takes a fifth of the width from 961 pixels up, so the two secondary columns, last
// activity and the trend, wait for the roomiest breakpoint, and the duration and cost for a phone.
//
// The id of a sortable column is the API's name for the field it sorts by (see `toApiSort` in lib/table-sort.ts).
// A column needs an accessor to be sortable at all; the server sorts, so the values are never read.
export function agentColumns({
    range,
    from,
    sortable,
}: AgentColumnsOptions): DataTableColumn<Agent>[] {
    return [
        {
            id: 'name',
            accessorFn: (agent) => agent.name,
            header: 'Agent',
            enableSorting: sortable,
            meta: {
                rowHeader: true,
                // The column takes the width the others leave (the cell's own width is capped at
                // nothing, so only the room decides where the text is cut).
                className: 'w-full max-w-0',
                // Two lines: the name, then the class.
                skeleton: (
                    <div className="flex w-24 max-w-full flex-col gap-2 py-1.5 xs:w-45">
                        <Skeleton
                            className={cn(skeletonBarClass, 'h-3.5 w-3/4')}
                        />
                        <Skeleton
                            className={cn(skeletonBarClass, 'h-3 w-1/2')}
                        />
                    </div>
                ),
            },
            cell: ({ row }) => (
                <AgentCell
                    agent={row.original}
                    to={agentPath(row.original.name, { range, from })}
                />
            ),
        },
        {
            id: 'runs',
            accessorFn: (agent) => agent.top_level?.runs.all,
            header: 'Runs',
            enableSorting: sortable,
            sortDescFirst: true,
            meta: {
                align: 'end',
                skeleton: (
                    <div className="flex flex-col items-end gap-2 py-1.5">
                        <Skeleton
                            className={cn(skeletonBarClass, 'h-3.5 w-8')}
                        />
                        <Skeleton
                            className={cn(skeletonBarClass, 'h-3 w-20')}
                        />
                    </div>
                ),
            },
            cell: ({ row }) => <RunsCell agent={row.original} />,
        },
        {
            id: 'error_rate',
            accessorFn: (agent) => agent.top_level?.error_rate.rate,
            header: 'Error rate',
            enableSorting: sortable,
            sortDescFirst: true,
            meta: { align: 'end' },
            cell: ({ row }) =>
                row.original.top_level === null ? (
                    <NotApplicable />
                ) : (
                    <ErrorRateCell own={row.original.top_level} />
                ),
        },
        {
            id: 'duration',
            accessorFn: (agent) => agent.top_level?.duration.average_ms,
            header: 'Avg duration',
            enableSorting: sortable,
            sortDescFirst: true,
            meta: { align: 'end', hideBelow: 'xs' },
            cell: ({ row }) =>
                row.original.top_level === null ? (
                    <NotApplicable />
                ) : (
                    // An average over many runs: it belongs to no single run, so it has no status.
                    <DurationValue
                        of={{
                            duration_ms:
                                row.original.top_level.duration.average_ms,
                        }}
                    />
                ),
        },
        {
            id: 'cost',
            accessorFn: (agent) => agent.top_level?.cost.amount,
            header: 'Est. cost',
            enableSorting: sortable,
            sortDescFirst: true,
            meta: { align: 'end', hideBelow: 'xs' },
            cell: ({ row }) =>
                row.original.top_level === null ? (
                    <NotApplicable />
                ) : (
                    <CostValue
                        cost={row.original.top_level.cost}
                        pendingAmount="show"
                        className="items-end"
                    />
                ),
        },
        {
            id: 'last_activity',
            accessorFn: (agent) => agent.last_activity_at,
            header: 'Last activity',
            enableSorting: sortable,
            sortDescFirst: true,
            meta: { align: 'end', hideBelow: 'roomy' },
            cell: ({ row }) => (
                // The timestamp says "Not captured" for a time it cannot read, which `null` is.
                <Timestamp
                    at={row.original.last_activity_at ?? ''}
                    layout="relative"
                />
            ),
        },
        {
            id: 'activity',
            // Each row is drawn from zero to its own busiest bucket: say so, so no one compares rows.
            header: () => (
                <span title="Each row is drawn on its own scale, from zero. Trends are not comparable between rows.">
                    Activity
                </span>
            ),
            meta: { align: 'end', hideBelow: 'roomy' },
            cell: ({ row }) => (
                <ActivityCell agent={row.original} period={periods[range]} />
            ),
        },
    ]
}
