import { Change } from '@/components/patterns/change'
import { Metric } from '@/components/patterns/metric'
import { changeCaption } from '@/features/overview/comparison'
import type { MetricProps } from '@/features/overview/metric-props'
import { tracesLink } from '@/features/overview/traces-link'
import { formatCount } from '@/lib/format'

/** How many runs started in the range. A count of 0 is a real answer. */
export function TracesMetric({ summary, previous, range }: MetricProps) {
    return (
        <Metric
            label="Traces"
            to={tracesLink(range)}
            change={
                <Change
                    mode="relative"
                    polarity="neutral"
                    current={summary.runs.all}
                    previous={previous?.runs.all ?? null}
                    caption={changeCaption(range)}
                />
            }
        >
            {formatCount(summary.runs.all)}
        </Metric>
    )
}
