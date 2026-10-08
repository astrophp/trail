import { isNotFound } from '@/api/client'
import { ErrorState } from '@/components/patterns/error-state'
import { LoadedTrace } from '@/features/trace/loaded-trace'
import { TraceNotFound } from '@/features/trace/trace-not-found'
import { TraceSkeleton } from '@/features/trace/trace-skeleton'
import {
    failedRefreshes,
    refreshing,
    useRetryRefresh,
    useTrace,
} from '@/features/trace/use-trace'
import { cn } from '@/lib/utils'

type TraceViewProps = {
    traceId: string
    /** Saves a bookmark change; the page supplies it from the traces feature. */
    onBookmarkChange: (bookmarked: boolean) => void
    /** Seconds after which an open run counts as abandoned, when the page knows it. */
    staleAfter?: number
    className?: string
}

/**
 * One run: its header and the execution tree with the selected span's facts. Loads the run
 * itself, and says so when it is loading, could not be loaded, or does not exist. A run that is
 * running refreshes by itself (see `useTrace`); a refresh that fails leaves the run on screen, except
 * for a 404, which means the run is gone.
 */
export function TraceView({
    traceId,
    onBookmarkChange,
    staleAfter,
    className,
}: TraceViewProps) {
    const query = useTrace(traceId)
    const { data, error } = query
    const notFound = isNotFound(error)
    const retryRefresh = useRetryRefresh(traceId)

    return (
        <div data-slot="trace-view" className={cn(className)}>
            {notFound ? (
                <TraceNotFound />
            ) : data ? (
                <LoadedTrace
                    // A run keeps nothing of the one before it.
                    key={data.data.trace.id}
                    data={data.data}
                    spanLimit={data.span_limit}
                    staleAfter={staleAfter}
                    refreshing={refreshing(
                        data.data.trace.status,
                        error,
                        failedRefreshes(traceId),
                    )}
                    onRetryRefresh={retryRefresh}
                    onBookmarkChange={onBookmarkChange}
                />
            ) : query.isError ? (
                <ErrorState
                    title="The run could not be loaded"
                    error={error}
                    onRetry={() => void query.refetch()}
                    retrying={query.isFetching}
                />
            ) : (
                <TraceSkeleton />
            )}
        </div>
    )
}
