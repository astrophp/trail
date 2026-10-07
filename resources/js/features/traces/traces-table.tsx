import { useEffect } from 'react'
import { DataTable } from '@/components/patterns/data-table'
import { Pagination } from '@/components/patterns/pagination'
import { traceColumns } from '@/features/traces/trace-columns'
import { toApiSort, toTableSort } from '@/features/traces/trace-sort'
import { useTraceList } from '@/features/traces/use-trace-list'
import { useTraces } from '@/features/traces/use-traces'
import { useTimeRange } from '@/hooks/use-time-range'
import { cn } from '@/lib/utils'

const getRowId = (trace: { id: string }) => trace.id

function Line({
    role,
    children,
    className,
}: {
    role: 'status' | 'alert'
    children: string
    className?: string
}) {
    return (
        <p
            role={role}
            className={cn('text-ui text-muted-foreground', className)}
        >
            {children}
        </p>
    )
}

/** The recorded runs of the chosen range: sorted and paged by the server, driven by the URL. */
export function TracesTable({ className }: { className?: string }) {
    const [range] = useTimeRange()
    const { sort, page, setSort, setPage } = useTraceList()
    const { data, isError, isPlaceholderData } = useTraces({
        range,
        sort,
        page,
    })

    // A page past the end (a stale link, pruned runs) answers with no rows but the real
    // totals: land on the real last page instead, without a history entry of its own.
    const pastTheEnd =
        data !== undefined &&
        !isPlaceholderData &&
        data.data.length === 0 &&
        data.pagination.total > 0 &&
        page !== data.pagination.last_page
    const lastPage = data?.pagination.last_page

    useEffect(() => {
        if (pastTheEnd && lastPage !== undefined) {
            setPage(lastPage, { replace: true })
        }
    }, [pastTheEnd, lastPage, setPage])

    // An errored query has no placeholder data, so this is a view that has nothing to show.
    if (isError && data === undefined) {
        return (
            <Line role="alert" className={className}>
                The runs could not be loaded.
            </Line>
        )
    }

    // Placeholder data answers for the previous URL, so an empty one says nothing about this one.
    if (
        data === undefined ||
        pastTheEnd ||
        (isPlaceholderData && data.pagination.total === 0)
    ) {
        return (
            <Line role="status" className={className}>
                Loading runs…
            </Line>
        )
    }

    if (data.pagination.total === 0) {
        return (
            <Line role="status" className={className}>
                No runs in this time range.
            </Line>
        )
    }

    return (
        <div
            aria-busy={isPlaceholderData || undefined}
            className={cn(
                'motion-safe:transition-opacity',
                isPlaceholderData && 'opacity-60',
                className,
            )}
        >
            <DataTable
                columns={traceColumns}
                data={data.data}
                getRowId={getRowId}
                sort={toTableSort(sort)}
                onSortChange={(next) => setSort(toApiSort(next))}
                caption="Recorded runs"
                footer={
                    <Pagination
                        // The page the rows on screen belong to, not the one the URL has moved to.
                        page={data.pagination.page}
                        perPage={data.pagination.per_page}
                        total={data.pagination.total}
                        lastPage={data.pagination.last_page}
                        onPageChange={setPage}
                        noun={{ one: 'trace', other: 'traces' }}
                    />
                }
            />
        </div>
    )
}
