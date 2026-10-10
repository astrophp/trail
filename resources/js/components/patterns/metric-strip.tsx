import type { ReactNode } from 'react'
import {
    metricStripClassName,
    metricStripGridClassName,
} from '@/components/patterns/metric-strip-styles'
import { cn } from '@/lib/utils'

type MetricStripProps = {
    /** `Metric` elements. */
    children: ReactNode
    className?: string
}

/**
 * A compact row of labelled figures. It is a description list: each `Metric` is a label with its
 * value. One row when it is wide enough, two columns when it is not; an odd last metric spans both.
 */
export function MetricStrip({ children, className }: MetricStripProps) {
    return (
        <div
            data-slot="metric-strip"
            className={cn(metricStripClassName, className)}
        >
            <dl className={metricStripGridClassName}>{children}</dl>
        </div>
    )
}
