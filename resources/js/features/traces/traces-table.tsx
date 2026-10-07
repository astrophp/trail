import { SearchXIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DataTable } from '@/components/patterns/data-table'
import { EmptyState } from '@/components/patterns/empty-state'
import { ErrorState } from '@/components/patterns/error-state'
import { Pagination } from '@/components/patterns/pagination'
import { traceColumns } from '@/features/traces/trace-columns'
import { toApiSort, toTableSort } from '@/features/traces/trace-sort'
import { useTraceList } from '@/features/traces/use-trace-list'
import { useTraces } from '@/features/traces/use-traces'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { useTimeRange } from '@/hooks/use-time-range'

const getRowId = (trace: { id: string }) => trace.id

/** The recorded runs of the chosen range: sorted and paged by the server, driven by the URL. */
export function TracesTable({ className }: { className?: string }) {
    const [range] = useTimeRange()
    const { sort, page, setSort, setPage } = useTraceList()
    const { data, isError, error, refetch, isFetching, isPlaceholderData } =
        useTraces({ range, sort, page })

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

    // A retry makes the query pending again and clears its error. Remember the failure of this
    // view, so the error state stays on screen (and keeps focus) while the retry runs.
    const view = `${range}|${sort}|${page}`
    const [failure, setFailure] = useState<{
        view: string
        error: unknown
    } | null>(null)

    if (isError && (failure?.view !== view || failure.error !== error)) {
        setFailure({ view, error })
    }

    // An errored query has no placeholder data, so this is a view that has nothing to show.
    const failed =
        data === undefined &&
        (isError || (isFetching && failure?.view === view))
    const retrying = failed && !isError && isFetching
    // Placeholder data answers for the previous URL, so an empty one says nothing about this one.
    const loading =
        data === undefined ||
        pastTheEnd ||
        (isPlaceholderData && data.pagination.total === 0)
    const empty = !failed && !loading && data.pagination.total === 0

    // The retry button goes away when rows replace the error state.
    useFocusHandoff(failed)

    if (failed) {
        return (
            <ErrorState
                title="The runs could not be loaded"
                error={isError ? error : failure?.error}
                retrying={retrying}
                className={className}
                onRetry={() => void refetch()}
            />
        )
    }

    return (
        <DataTable
            loading={loading}
            busy={isPlaceholderData}
            columns={traceColumns}
            data={data?.data ?? []}
            getRowId={getRowId}
            sort={toTableSort(sort)}
            onSortChange={(next) => setSort(toApiSort(next))}
            caption="Recorded runs"
            className={className}
            empty={
                empty ? (
                    <EmptyState
                        icon={SearchXIcon}
                        title="No runs found"
                        description="Runs appear here as your agents run."
                    />
                ) : undefined
            }
            footer={
                data === undefined || loading ? undefined : (
                    <Pagination
                        // The page the rows on screen belong to, not the one the URL has moved to.
                        page={data.pagination.page}
                        perPage={data.pagination.per_page}
                        total={data.pagination.total}
                        lastPage={data.pagination.last_page}
                        onPageChange={setPage}
                        noun={{ one: 'trace', other: 'traces' }}
                    />
                )
            }
        />
    )
}
