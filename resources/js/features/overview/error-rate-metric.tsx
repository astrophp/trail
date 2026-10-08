import { Change } from '@/components/patterns/change'
import { Metric } from '@/components/patterns/metric'
import { RateValue } from '@/components/telemetry/rate-value'
import { changeCaption, missingEarlier } from '@/features/overview/comparison'
import type { MetricProps } from '@/features/overview/metric-props'
import { tracesLink } from '@/features/overview/traces-link'
import { formatCount } from '@/lib/format'

/**
 * The share of finished runs that failed. Incomplete runs are finished and not failed, so the two
 * counts under it are told apart and never added.
 */
export function ErrorRateMetric({ summary, previous, range }: MetricProps) {
    const { rate, failed, finished } = summary.error_rate
    const { incomplete } = summary.runs
    const earlier = previous?.error_rate.rate ?? null

    return (
        <Metric
            label="Error rate"
            to={tracesLink(range, { status: 'failed' })}
            change={
                <Change
                    mode="points"
                    polarity="up-is-bad"
                    current={rate}
                    previous={earlier}
                    noPreviousLabel={missingEarlier(previous, 'rate')}
                    caption={changeCaption(range)}
                />
            }
            detail={
                finished === 0 ? undefined : (
                    <>
                        <span>{formatCount(failed)} failed</span>
                        {incomplete > 0 ? (
                            <span> · {formatCount(incomplete)} incomplete</span>
                        ) : null}
                    </>
                )
            }
        >
            <RateValue rate={rate} />
        </Metric>
    )
}
