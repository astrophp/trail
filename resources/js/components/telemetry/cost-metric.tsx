import { Change } from '@/components/patterns/change'
import { Metric } from '@/components/patterns/metric'
import { CostValue } from '@/components/telemetry/cost-value'
import type { Cost } from '@/api/types'
import { changeCaption } from '@/components/telemetry/comparison'
import type { MetricProps } from '@/components/telemetry/metric-props'
import { formatCount } from '@/lib/format'

/** An amount that can be compared: only an estimated cost is one. Partial, pending and missing ones are not. */
const comparable = (cost: Cost): number | null =>
    cost.state === 'estimated' ? cost.amount : null

type CostMetricProps = MetricProps & {
    /**
     * Whether the count of runs with an unpriced step is said under the cost. `hide` is for a page
     * where something else owns coverage and would say it twice.
     */
    unpricedRuns?: 'show' | 'hide'
}

/** What the runs of the range cost, in the state the endpoint gives it. */
export function CostMetric({
    summary,
    previous,
    range,
    link,
    unpricedRuns = 'show',
}: CostMetricProps) {
    const { unpriced_runs } = summary.cost_coverage
    const current = comparable(summary.cost)
    const before = previous === null ? null : comparable(previous.cost)

    return (
        <Metric
            label="Estimated cost"
            to={link(range, { sort: '-cost' })}
            change={
                current === null || before === null ? undefined : (
                    <Change
                        mode="relative"
                        polarity="neutral"
                        current={current}
                        previous={before}
                        renderDifference={(amount) => (
                            <CostValue cost={{ state: 'estimated', amount }} />
                        )}
                        caption={changeCaption(range)}
                    />
                )
            }
            detail={
                unpricedRuns === 'show' && unpriced_runs > 0
                    ? `${formatCount(unpriced_runs)} unpriced ${unpriced_runs === 1 ? 'run' : 'runs'}`
                    : undefined
            }
        >
            <CostValue cost={summary.cost} pendingAmount="show" />
        </Metric>
    )
}
