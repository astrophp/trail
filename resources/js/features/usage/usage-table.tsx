import { useMemo, type ReactNode } from 'react'
import type { To } from 'react-router'
import { linkRows, unlinkable } from '@/api/traces-link'
import type { UsageBreakdownRow } from '@/api/types'
import { usageSorts, type UsageGrouping, type UsageSort } from '@/api/usage'
import { DataTable } from '@/components/patterns/data-table'
import { usageColumns } from '@/features/usage/usage-columns'
import { useUnlinkedReport } from '@/hooks/use-unlinked-report'
import type { TimeRangePreset } from '@/lib/time-range'
import { toApiSort, toTableSort } from '@/lib/table-sort'

type UsageTableProps = {
    rows: UsageBreakdownRow[]
    /** What the rows are grouped by: the previous view's while the next loads. */
    by: UsageGrouping
    /** The range the rows were counted over, which every link out carries. */
    range: TimeRangePreset
    sort: UsageSort
    onSortChange: (sort: UsageSort) => void
    caption: string
    loading?: boolean
    busy?: boolean
    empty?: ReactNode
    footer?: ReactNode
    className?: string
}

/** A name is not a row's identity on its own: a model is a provider's. */
const getRowId = (row: UsageBreakdownRow) =>
    'agent' in row
        ? row.agent
        : 'model' in row
          ? `${row.provider}\n${row.model}`
          : row.provider

/**
 * The rows of the usage breakdown, sorted and paged by the server. Each row leads to the traces
 * list over exactly the runs it counted; one whose filters the list cannot take has no link and
 * says so. A token column that no row of the page reported is left out.
 */
export function UsageTable({
    rows,
    by,
    range,
    sort,
    onSortChange,
    caption,
    loading,
    busy,
    empty,
    footer,
    className,
}: UsageTableProps) {
    const linked = useMemo(() => linkRows(rows, range), [rows, range])
    const links = useMemo(
        () =>
            new Map<UsageBreakdownRow, To | null>(
                linked.map((r) => [r.row, r.to]),
            ),
        [linked],
    )

    useUnlinkedReport('usage', unlinkable(linked))

    const reported = (read: (row: UsageBreakdownRow) => number | null) =>
        rows.some((row) => read(row) !== null)
    const cacheRead = reported((row) => row.usage.cache_read_tokens)
    const cacheWrite = reported((row) => row.usage.cache_write_tokens)
    const reasoning = reported((row) => row.usage.reasoning_tokens)
    const columns = useMemo(
        () =>
            usageColumns({
                by,
                linkOf: (row) => links.get(row) ?? null,
                tokens: { cacheRead, cacheWrite, reasoning },
            }),
        [by, links, cacheRead, cacheWrite, reasoning],
    )

    return (
        <DataTable
            loading={loading}
            busy={busy}
            loadingLabel="Loading the breakdown"
            columns={columns}
            data={rows}
            getRowId={getRowId}
            sort={toTableSort(sort)}
            onSortChange={(next) => onSortChange(toApiSort(usageSorts, next))}
            caption={caption}
            empty={empty}
            footer={footer}
            className={className}
        />
    )
}
