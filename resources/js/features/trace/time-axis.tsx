import { axisTicks } from '@/features/trace/timing-axis'
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
 * A tick's label. The ends carry the unit (`0 ms`, `5.0 ms`, `2.00s`); the ticks between are bare
 * numbers in the end's unit, to two significant figures (`1.3`, `2.5`, `11`), so the axis reads at a glance without repeating it.
 */
function tickLabel(tick: number, axisMs: number, index: number, last: number) {
    if (index === 0) {
        return '0 ms'
    }

    if (index === last) {
        return formatDuration(axisMs)
    }

    const value = axisMs < 1_000 ? tick : tick / 1_000

    // Two significant figures are enough to place a gridline, and keep the labels clear of each other.
    return String(
        value >= 10 ? Math.round(value) : Number(value.toPrecision(2)),
    )
}

/**
 * The ticks over the timing lane in the column labels: the start, the quarters and the end of the
 * axis, each with a short mark the rows' gridlines continue. They only label the bars, whose own sentences carry the facts, so the labels
 * around them are hidden from assistive technology.
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

    const ticks = axisTicks(axisMs)

    return (
        <span
            data-slot="time-axis"
            className={cn('relative block h-6 tabular-nums', className)}
        >
            {ticks.map((tick, index) => (
                <span
                    key={tick}
                    className={cn(
                        'absolute top-0 flex flex-col gap-1 whitespace-nowrap',
                        index === 0
                            ? 'items-start'
                            : index === ticks.length - 1
                              ? '-translate-x-full items-end'
                              : '-translate-x-1/2 items-center',
                    )}
                    style={{ left: `${(tick / axisMs) * 100}%` }}
                >
                    {tickLabel(tick, axisMs, index, ticks.length - 1)}
                    <span aria-hidden="true" className="h-1.5 w-px bg-border" />
                </span>
            ))}
        </span>
    )
}
