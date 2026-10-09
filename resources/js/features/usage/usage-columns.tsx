import type { To } from 'react-router'
import type { UsageBreakdownRow } from '@/api/types'
import type { UsageGrouping } from '@/api/usage'
import {
    skeletonBarClass,
    type DataTableColumn,
} from '@/components/patterns/data-table'
import { CostValue } from '@/components/telemetry/cost-value'
import { TokenCount } from '@/components/telemetry/token-count'
import { TokenValue } from '@/components/telemetry/token-value'
import { Skeleton } from '@/components/ui/skeleton'
import { CoverageCell } from '@/features/usage/coverage-cell'
import { UsageKeyCell } from '@/features/usage/usage-key-cell'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

/** The token columns that are only drawn when some row of the page reported them. */
export type OptionalTokens = {
    cacheRead: boolean
    cacheWrite: boolean
    reasoning: boolean
}

type UsageColumnsOptions = {
    /** What the rows are grouped by: it names the first column. */
    by: UsageGrouping
    /** Where a row leads: the runs behind it, or nowhere. */
    linkOf: (row: UsageBreakdownRow) => To | null
    /** Which of the optional token columns have something to show. */
    tokens: OptionalTokens
}

const keyHeaders: Record<UsageGrouping, string> = {
    model: 'Model',
    agent: 'Agent',
    provider: 'Provider',
}

/** The name a row is sorted by, which the server sorts on; the values here are never read to sort. */
const keyOf = (row: UsageBreakdownRow): string =>
    'agent' in row
        ? row.agent
        : 'model' in row
          ? `${row.provider} ${row.model}`
          : row.provider

const numeric = (id: string, header: string, hideBelow?: 'xs' | 'md') => ({
    id,
    header,
    sortDescFirst: true,
    meta: { align: 'end' as const, hideBelow },
})

// The columns are dropped so the table does not have to scroll sideways at a width the page offers
// it: the sidebar takes a fifth of the width from 961 pixels up, so the token columns that say
// least wait for the roomier breakpoints, and a phone keeps the name, the runs, the tokens (whose sort needs a header) and the cost.
//
// The id of a sortable column is the API's name for the field it sorts by (see `toApiSort` in
// lib/table-sort.ts). The server sorts, so the accessors only make the column sortable.
export function usageColumns({
    by,
    linkOf,
    tokens,
}: UsageColumnsOptions): DataTableColumn<UsageBreakdownRow>[] {
    const count = (
        id: string,
        header: string,
        read: (row: UsageBreakdownRow) => number | null,
        hideBelow: 'xs' | 'md' | 'wide' | 'roomy',
    ): DataTableColumn<UsageBreakdownRow> => ({
        id,
        header,
        meta: { align: 'end', hideBelow },
        cell: ({ row }) => (
            <TokenCount
                count={read(row.original)}
                pending={row.original.usage.state === 'pending'}
                pendingAmount="show"
            />
        ),
    })

    return [
        {
            id: 'name',
            accessorFn: keyOf,
            header: keyHeaders[by],
            enableSorting: true,
            meta: {
                rowHeader: true,
                // The column takes the width the others leave, never less than a floor: the cell is cut at its width (max-w-0), so without one it collapses under its neighbour.
                className: 'w-full max-w-0 min-w-32 xs:min-w-40',
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
                <UsageKeyCell row={row.original} to={linkOf(row.original)} />
            ),
        },
        {
            ...numeric('runs', 'Runs'),
            accessorFn: (row) => row.runs,
            enableSorting: true,
            cell: ({ row }) => formatCount(row.original.runs),
        },
        {
            id: 'steps',
            header: 'Steps',
            meta: { align: 'end', hideBelow: 'md' },
            cell: ({ row }) => formatCount(row.original.steps),
        },
        {
            ...numeric('tokens', 'Tokens'),
            accessorFn: (row) => row.usage.total_tokens,
            enableSorting: true,
            cell: ({ row }) => (
                <TokenValue usage={row.original.usage} pendingAmount="show" />
            ),
        },
        // Input and output are always drawn: a count that was not reported says so, in the cell.
        count('input', 'Input tokens', (row) => row.usage.input_tokens, 'xs'),
        count(
            'output',
            'Output tokens',
            (row) => row.usage.output_tokens,
            'xs',
        ),
        ...(tokens.cacheRead
            ? [
                  count(
                      'cache_read',
                      'Cache read',
                      (row) => row.usage.cache_read_tokens,
                      'wide',
                  ),
              ]
            : []),
        ...(tokens.cacheWrite
            ? [
                  count(
                      'cache_write',
                      'Cache write',
                      (row) => row.usage.cache_write_tokens,
                      'wide',
                  ),
              ]
            : []),
        ...(tokens.reasoning
            ? [
                  count(
                      'reasoning',
                      'Reasoning',
                      (row) => row.usage.reasoning_tokens,
                      'roomy',
                  ),
              ]
            : []),
        {
            ...numeric('cost', 'Est. cost'),
            accessorFn: (row) => row.cost.amount,
            enableSorting: true,
            cell: ({ row }) => (
                <CostValue
                    cost={row.original.cost}
                    pendingAmount="show"
                    className="items-end"
                />
            ),
        },
        {
            id: 'coverage',
            header: 'Coverage',
            meta: { hideBelow: 'md' },
            cell: ({ row }) => (
                <CoverageCell coverage={row.original.coverage} />
            ),
        },
    ]
}
