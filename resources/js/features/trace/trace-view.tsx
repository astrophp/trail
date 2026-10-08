import { ApiError } from '@/api/client'
import { ErrorState } from '@/components/patterns/error-state'
import { LoadedTrace } from '@/features/trace/loaded-trace'
import { TraceNotFound } from '@/features/trace/trace-not-found'
import { TraceSkeleton } from '@/features/trace/trace-skeleton'
import { useTrace } from '@/features/trace/use-trace'
import { cn } from '@/lib/utils'

type TraceViewProps = {
    traceId: string
    /** Saves a bookmark change; the page supplies it from the traces feature. */
    onBookmarkChange: (bookmarked: boolean) => void
    className?: string
}

/**
 * One run: its header and the execution tree with the selected span's facts. Loads the run
 * itself, and says so when it is loading, could not be loaded, or does not exist.
 */
export function TraceView({
    traceId,
    onBookmarkChange,
    className,
}: TraceViewProps) {
    const query = useTrace(traceId)
    const { data, error } = query

    return (
        <div data-slot="trace-view" className={cn(className)}>
            {data ? (
                <LoadedTrace
                    data={data.data}
                    spanLimit={data.span_limit}
                    onBookmarkChange={onBookmarkChange}
                />
            ) : query.isError ? (
                error instanceof ApiError && error.status === 404 ? (
                    <TraceNotFound />
                ) : (
                    <ErrorState
                        title="The run could not be loaded"
                        error={error}
                        onRetry={() => void query.refetch()}
                        retrying={query.isFetching}
                    />
                )
            ) : (
                <TraceSkeleton />
            )}
        </div>
    )
}
