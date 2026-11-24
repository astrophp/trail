import { memo } from 'react'
import { axisTicks } from '@/features/trace/timing-axis'
import { cn } from '@/lib/utils'

type TimingGridProps = {
    /** The length of the axis in milliseconds; `null` draws nothing. */
    axisMs: number | null
    /**
     * Where the lane starts and ends inside the positioned box it covers: a row's padding
     * (`inset-x-2`, the default) or, for the whole list, the list's and a row's (`inset-x-4`).
     */
    className?: string
}

/**
 * The gridlines of the axis's ticks, like a network waterfall's: behind one row of the execution
 * tree, or behind the whole list so they run on below the last row to the bottom of the pane. A
 * row's covers its whole height and the rows sit edge to edge, so all the lines join. It is laid out
 * as the timing lane is: the right half (the right column), less the duration and the gap before
 * it. The box it covers must be positioned and isolated; the grid sits behind everything in it,
 * words and bars, and above only its background.
 */
export const TimingGrid = memo(function TimingGrid({
    axisMs,
    className = 'inset-x-2',
}: TimingGridProps) {
    if (axisMs === null) {
        return null
    }

    return (
        <div
            aria-hidden="true"
            data-slot="timing-grid"
            className={cn(
                'pointer-events-none absolute inset-y-0 -z-10 hidden justify-end md:flex',
                className,
            )}
        >
            <div className="h-full w-1/2 pe-22">
                <div className="relative h-full">
                    {axisTicks(axisMs).map((tick) => (
                        <span
                            key={tick}
                            className="absolute inset-y-0 w-px bg-border"
                            style={{ left: `${(tick / axisMs) * 100}%` }}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
})
