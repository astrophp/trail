import type { Trace } from '@/api/types'
import {
    skeletonBarClass,
    type DataTableColumn,
} from '@/components/patterns/data-table'
import { CostValue } from '@/components/telemetry/cost-value'
import { DurationValue } from '@/components/telemetry/duration-value'
import { ModelLabel } from '@/components/telemetry/model-label'
import { Timestamp } from '@/components/telemetry/timestamp'
import { TokenValue } from '@/components/telemetry/token-value'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { OutcomeCell } from '@/features/traces/outcome-cell'
import { RunCell } from '@/features/traces/run-cell'
import { SelectPage } from '@/features/traces/select-page'

// The id of a sortable column is the API's name for the field it sorts by (see `toApiSort` in lib/table-sort.ts).
// A column needs an accessor to be sortable at all; the server sorts, so the values are never read.
export const traceColumns: DataTableColumn<Trace>[] = [
    {
        id: 'agent',
        accessorFn: (trace) => trace.name,
        header: 'Run',
        enableSorting: true,
        meta: {
            rowHeader: true,
            lead: <SelectPage />,
            // The cell is three lines (the name, the prompt and the id) beside the checkbox and the bookmark's gutter.
            skeleton: (
                <div className="flex w-51.5 flex-col gap-2 py-1.5 pl-11.5 md:w-71.5">
                    <Skeleton className={cn(skeletonBarClass, 'h-3.5 w-3/4')} />
                    <Skeleton className={cn(skeletonBarClass, 'h-3 w-full')} />
                    <Skeleton className={cn(skeletonBarClass, 'h-3 w-1/2')} />
                </div>
            ),
        },
        cell: ({ row }) => <RunCell trace={row.original} />,
    },
    {
        id: 'outcome',
        header: 'Outcome',
        meta: {
            skeleton: (
                <Skeleton
                    className={cn(skeletonBarClass, 'h-5 w-20 rounded-full')}
                />
            ),
        },
        cell: ({ row }) => <OutcomeCell trace={row.original} />,
    },
    {
        id: 'model',
        header: 'Root model',
        cell: ({ row }) => <ModelLabel of={row.original} />,
    },
    {
        id: 'duration',
        accessorFn: (trace) => trace.duration_ms,
        header: 'Duration',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'end' },
        cell: ({ row }) => <DurationValue of={row.original} />,
    },
    {
        id: 'tokens',
        header: 'Tokens',
        meta: { align: 'end' },
        cell: ({ row }) => <TokenValue usage={row.original.usage} />,
    },
    {
        id: 'cost',
        accessorFn: (trace) => trace.cost.amount,
        header: 'Est. cost',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'end' },
        cell: ({ row }) => <CostValue cost={row.original.cost} />,
    },
    {
        id: 'started_at',
        accessorFn: (trace) => trace.started_at,
        header: 'Started',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'end' },
        cell: ({ row }) => <Timestamp at={row.original.started_at} />,
    },
]
