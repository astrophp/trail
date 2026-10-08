import type { UseQueryResult } from '@tanstack/react-query'
import { isNotFound } from '@/api/client'
import type { TraceDetailResponse } from '@/api/types'
import { skeletonBarClass } from '@/components/patterns/data-table'
import { ErrorState } from '@/components/patterns/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * What stands where a run's header would be while it has no data: bars while it loads, the words
 * when the run is gone, or the failure with a retry. Only the run's own column is affected.
 */
export function UnavailableRun({
    run,
}: {
    run: UseQueryResult<TraceDetailResponse>
}) {
    if (run.isPending) {
        return (
            <div className="flex flex-col gap-2" aria-hidden="true">
                <Skeleton className={cn(skeletonBarClass, 'h-4 w-3/4')} />
                <Skeleton className={cn(skeletonBarClass, 'h-3 w-1/2')} />
            </div>
        )
    }

    if (isNotFound(run.error)) {
        return (
            <div>
                <p className="font-medium">Run not found</p>
                <p className="text-caption text-muted-foreground">
                    It may have been pruned, or it was never recorded.
                </p>
            </div>
        )
    }

    return (
        <ErrorState
            title="The run could not be loaded"
            error={run.error}
            retrying={run.isFetching}
            onRetry={() => void run.refetch()}
            className="px-3 py-6"
        />
    )
}
