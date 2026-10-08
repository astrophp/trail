import {
    metricCellClassName,
    metricStripClassName,
    metricStripGridClassName,
} from '@/components/patterns/metric-strip-styles'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type MetricStripSkeletonProps = {
    /** How many metrics are on the way. */
    count: number
    className?: string
}

/** The place of a `MetricStrip` while its figures load: the same cells, with bars where the text will be. */
export function MetricStripSkeleton({
    count,
    className,
}: MetricStripSkeletonProps) {
    return (
        <div
            data-slot="metric-strip-skeleton"
            aria-busy="true"
            className={cn(metricStripClassName, className)}
        >
            <span className="sr-only">Loading</span>
            <div className={metricStripGridClassName}>
                {Array.from({ length: count }, (_, index) => (
                    <div
                        key={index}
                        data-slot="metric-skeleton"
                        aria-hidden="true"
                        className={metricCellClassName}
                    >
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="mt-2 h-7 w-24" />
                        <Skeleton className="mt-2.5 h-3 w-20" />
                    </div>
                ))}
            </div>
        </div>
    )
}
