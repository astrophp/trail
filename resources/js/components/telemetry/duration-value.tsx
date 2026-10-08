import type { Status } from '@/api/types'
import { formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'

type DurationValueProps = {
    /**
     * A run or, later, a span: anything with a duration and the status it had. Without a status the
     * figure belongs to no single run (an average or a percentile over many): missing, it reads
     * "No measured runs".
     */
    of: { duration_ms: number | null; status?: Status }
    className?: string
}

/** How long something took. A running run is in progress; without a duration it was not captured. */
export function DurationValue({ of, className }: DurationValueProps) {
    // A number on a run still in flight is not how long it took.
    if (of.status === 'running' || of.duration_ms === null) {
        return (
            <span
                data-slot="duration-value"
                className={cn('text-muted-foreground', className)}
            >
                {of.status === 'running'
                    ? 'In progress'
                    : of.status === undefined
                      ? 'No measured runs'
                      : 'Not captured'}
            </span>
        )
    }

    return (
        <span
            data-slot="duration-value"
            className={cn('tabular-nums', className)}
        >
            {formatDuration(of.duration_ms)}
        </span>
    )
}
