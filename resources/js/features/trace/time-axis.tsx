import { formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'

type TimeAxisProps = {
    /** The length of the axis in milliseconds; `null` when no span has captured timing. */
    axisMs: number | null
    /** Whether any span of the run is still running. */
    running?: boolean
    className?: string
}

/**
 * The ticks over the timing lane in the column labels: the start, the middle and the end of the
 * run's axis. They only label the bars, whose own sentences carry the facts, so the labels around
 * them are hidden from assistive technology.
 */
export function TimeAxis({
    axisMs,
    running = false,
    className,
}: TimeAxisProps) {
    if (axisMs === null) {
        return (
            <span data-slot="time-axis" className={cn('truncate', className)}>
                {running ? 'In progress' : 'Timing not captured'}
            </span>
        )
    }

    return (
        <span
            data-slot="time-axis"
            className={cn('relative block h-4 tabular-nums', className)}
        >
            <span className="absolute left-0">0 ms</span>
            <span className="absolute left-1/2 -translate-x-1/2">
                {formatDuration(axisMs / 2)}
            </span>
            <span className="absolute right-0">{formatDuration(axisMs)}</span>
        </span>
    )
}
