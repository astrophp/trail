import {
    sparklinePath,
    type SparklineBaseline,
} from '@/components/patterns/sparkline-path'
import { cn } from '@/lib/utils'

type SparklineProps = {
    /** One value per step, oldest first. `null` is not captured: it breaks the line. */
    values: (number | null)[]
    /** What the trend says, in words. Read by assistive technology; the drawing is hidden from it. */
    summary: string
    /**
     * Where the bottom of the line is. `range` (the default) is the row's lowest value, so any line
     * fills the box; `zero` is 0, so a line that never drops to zero is not stretched to fill it. Each line still has
     * its own scale: two sparklines are not comparable with each other.
     */
    baseline?: SparklineBaseline
    /** Sets the size and, with a text colour class, the colour of the line. */
    className?: string
}

/**
 * A tiny trend for a table cell, drawn as one SVG path (not a chart: a table holds many). It has
 * no axis and no scale of its own: the line is stretched between its lowest and highest value.
 * With fewer than two values to draw it draws nothing, and the summary is still there.
 */
export function Sparkline({
    values,
    summary,
    baseline = 'range',
    className,
}: SparklineProps) {
    const path = sparklinePath(values, baseline)

    return (
        <span
            data-slot="sparkline"
            className={cn(
                'inline-block h-6 w-24 align-middle text-chart-1',
                className,
            )}
        >
            {path ? (
                <svg
                    aria-hidden="true"
                    focusable="false"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="size-full overflow-visible"
                >
                    <path
                        d={path}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                    />
                </svg>
            ) : null}
            <span className="sr-only">{summary}</span>
        </span>
    )
}
