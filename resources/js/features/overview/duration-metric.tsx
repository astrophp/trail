import { Change } from '@/components/patterns/change'
import { Metric } from '@/components/patterns/metric'
import { DurationValue } from '@/components/telemetry/duration-value'
import { changeCaption, missingEarlier } from '@/features/overview/comparison'
import type { MetricProps } from '@/features/overview/metric-props'
import { tracesLink } from '@/features/overview/traces-link'
import { formatCount } from '@/lib/format'

const measured = (duration_ms: number | null) => (
    <DurationValue of={{ duration_ms, status: 'completed' }} />
)

/**
 * The 95th percentile of the runs' durations. Below the minimum of measured runs there is no
 * percentile, and the average takes its place under its own name, so a figure of one kind is
 * never passed off as the other.
 */
export function DurationMetric({ summary, previous, range }: MetricProps) {
    const { average_ms, p95_ms, measured: runs, p95_minimum } = summary.duration

    if (p95_ms === null) {
        return (
            <Metric
                label="Avg duration"
                change={
                    <Change
                        mode="absolute"
                        polarity="up-is-bad"
                        current={average_ms}
                        previous={previous?.duration.average_ms ?? null}
                        noPreviousLabel={missingEarlier(previous, 'average')}
                        renderDifference={(ms) => measured(ms)}
                        caption={changeCaption(range)}
                    />
                }
                detail={`p95 needs ${formatCount(p95_minimum)} measured runs · ${formatCount(runs)} so far`}
            >
                {measured(average_ms)}
            </Metric>
        )
    }

    return (
        <Metric
            label="p95 duration"
            to={tracesLink(range, { slow: true })}
            change={
                <Change
                    mode="absolute"
                    polarity="up-is-bad"
                    current={p95_ms}
                    previous={previous?.duration.p95_ms ?? null}
                    noPreviousLabel={missingEarlier(previous, 'p95')}
                    renderDifference={(ms) => measured(ms)}
                    caption={changeCaption(range)}
                />
            }
            detail={<>avg {measured(average_ms)}</>}
        >
            {measured(p95_ms)}
        </Metric>
    )
}
