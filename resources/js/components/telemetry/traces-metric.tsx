import type { ReactNode } from 'react'
import { Change } from '@/components/patterns/change'
import { Metric } from '@/components/patterns/metric'
import { changeCaption } from '@/components/telemetry/comparison'
import type { MetricProps } from '@/components/telemetry/metric-props'
import { formatCount } from '@/lib/format'

/** How many runs started in the range. A count of 0 is a real answer. */
export function TracesMetric({
    summary,
    previous,
    range,
    link,
    detail,
}: MetricProps & {
    /** Under the figure, such as how many of the runs were delegated. */
    detail?: ReactNode
}) {
    return (
        <Metric
            label="Traces"
            to={link(range)}
            change={
                previous === null ? undefined : (
                    <Change
                        mode="relative"
                        polarity="neutral"
                        current={summary.runs.all}
                        previous={previous.runs.all}
                        caption={changeCaption(range)}
                    />
                )
            }
            detail={detail}
        >
            {formatCount(summary.runs.all)}
        </Metric>
    )
}
