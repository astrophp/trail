import type { Trace } from '@/api/types'
import type { DataTableColumn } from '@/components/patterns/data-table'
import { CostValue } from '@/components/telemetry/cost-value'
import { DurationValue } from '@/components/telemetry/duration-value'
import { ModelLabel } from '@/components/telemetry/model-label'
import { Timestamp } from '@/components/telemetry/timestamp'
import { TokenValue } from '@/components/telemetry/token-value'
import { OutcomeCell } from '@/features/traces/outcome-cell'
import { RunCell } from '@/features/traces/run-cell'

// The id of a sortable column is the API's name for the field it sorts by (see trace-sort.ts).
// A column needs an accessor to be sortable at all; the server sorts, so the values are never read.
export const traceColumns: DataTableColumn<Trace>[] = [
    {
        id: 'agent',
        accessorFn: (trace) => trace.name,
        header: 'Run',
        enableSorting: true,
        meta: { rowHeader: true },
        cell: ({ row }) => <RunCell trace={row.original} />,
    },
    {
        id: 'outcome',
        header: 'Outcome',
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
