import { Change } from '@/components/patterns/change'
import { Metric } from '@/components/patterns/metric'
import { RateValue } from '@/components/telemetry/rate-value'
import { changeCaption, noEarlier } from '@/components/telemetry/comparison'
import type { MetricProps } from '@/components/telemetry/metric-props'
import { formatCount } from '@/lib/format'

/**
 * The share of finished runs that failed. Incomplete runs are finished and not failed, so the two
 * counts under it are told apart and never added.
 */
export function ErrorRateMetric({
    summary,
    previous,
    range,
    link,
}: MetricProps) {
    const { rate, failed, finished } = summary.error_rate
    const { incomplete } = summary.runs

    return (
        <Metric
            label="Error rate"
            to={link(range, { status: 'failed' })}
            change={
                previous === null ? undefined : (
                    <Change
                        mode="points"
                        polarity="up-is-bad"
                        current={rate}
                        previous={previous.error_rate.rate}
                        noPreviousLabel={noEarlier('rate')}
                        caption={changeCaption(range)}
                    />
                )
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
