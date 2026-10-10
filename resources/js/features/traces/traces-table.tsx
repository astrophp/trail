import { SearchXIcon } from 'lucide-react'
import { useRef, type RefObject } from 'react'
import { traceSorts } from '@/api/traces'
import { DataTable } from '@/components/patterns/data-table'
import { EmptyState } from '@/components/patterns/empty-state'
import { ErrorState } from '@/components/patterns/error-state'
import { Pagination } from '@/components/patterns/pagination'
import { Button } from '@/components/ui/button'
import { traceColumns } from '@/features/traces/trace-columns'
import { useTraceList } from '@/features/traces/use-trace-list'
import { useTraces } from '@/features/traces/use-traces'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { pageShortcuts, useListShortcuts } from '@/hooks/use-list-shortcuts'
import { useListStatus } from '@/hooks/use-list-status'
import { toApiSort, toTableSort } from '@/lib/table-sort'

const getRowId = (trace: { id: string }) => trace.id

/** The recorded runs of the chosen range: sorted and paged by the server, driven by the URL. */
export function TracesTable({
    searchRef,
    className,
}: {
    /** Where focus goes when the filters are cleared from here: the same place "Clear all" leaves it. */
    searchRef: RefObject<HTMLInputElement | null>
    className?: string
}) {
    const { view, sort, page, hasFilters, setSort, setPage, clearAll } =
        useTraceList()
    const { data, isError, error, refetch, isFetching, isPlaceholderData } =
        useTraces(view)

    const { failed, retrying, loading, empty, failure } = useListStatus({
        data,
        isError,
        error,
        isFetching,
        isPlaceholderData,
        page,
        setPage,
        viewKey: JSON.stringify(view),
    })

    // The retry button, or the button of a no-match state, goes away when rows replace it.
    useFocusHandoff(failed || (empty && hasFilters))

    const tableRef = useRef<HTMLDivElement>(null)

    useListShortcuts({
        table: tableRef,
        search: searchRef,
        // The page the rows on screen belong to, not the one the URL has moved to.
        pages:
            data === undefined || loading
                ? undefined
                : {
                      page: data.pagination.page,
                      last: data.pagination.last_page,
                      go: setPage,
                  },
    })

    if (failed) {
        return (
            <ErrorState
                title="The runs could not be loaded"
                error={failure}
                retrying={retrying}
                className={className}
                onRetry={() => void refetch()}
            />
        )
    }

    return (
        <DataTable
            ref={tableRef}
            loading={loading}
            busy={isPlaceholderData}
            columns={traceColumns}
            data={data?.data ?? []}
            getRowId={getRowId}
            sort={toTableSort(sort)}
            onSortChange={(next) => setSort(toApiSort(traceSorts, next))}
            caption="Recorded runs"
            className={className}
            empty={
                empty ? (
                    hasFilters ? (
                        <EmptyState
                            icon={SearchXIcon}
                            title="No runs match these filters"
                            description="Try removing a filter, widening the time range or searching for something else."
                        >
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    clearAll()
                                    searchRef.current?.focus()
                                }}
                            >
                                Clear filters
                            </Button>
                        </EmptyState>
                    ) : (
                        <EmptyState
                            icon={SearchXIcon}
                            title="No runs found"
                            description="Runs appear here as your agents run."
                        />
                    )
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
                        shortcuts={pageShortcuts()}
                        noun={{ one: 'trace', other: 'traces' }}
                    />
                )
            }
        />
    )
}
