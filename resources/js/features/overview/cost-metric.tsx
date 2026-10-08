import { Change } from '@/components/patterns/change'
import { Metric } from '@/components/patterns/metric'
import { CostValue } from '@/components/telemetry/cost-value'
import type { Cost } from '@/api/types'
import { changeCaption, missingEarlier } from '@/features/overview/comparison'
import type { MetricProps } from '@/features/overview/metric-props'
import { tracesLink } from '@/features/overview/traces-link'
import { formatCount } from '@/lib/format'

/**
 * The amount a cost can be compared by: one that is final. A pending amount is only what has been
 * recorded so far, and an unpriced or uncaptured cost has none.
 */
const comparable = (cost: Cost | undefined): number | null =>
    cost?.state === 'estimated' || cost?.state === 'partial'
        ? cost.amount
        : null

/** What the runs of the range cost, in the state the endpoint gives it. */
export function CostMetric({ summary, previous, range }: MetricProps) {
    const { unpriced_runs } = summary.cost_coverage

    return (
        <Metric
            label="Estimated cost"
            to={tracesLink(range, { sort: '-cost' })}
            change={
                <Change
                    mode="relative"
                    polarity="neutral"
                    current={comparable(summary.cost)}
                    previous={comparable(previous?.cost)}
                    noPreviousLabel={missingEarlier(previous, 'cost')}
                    renderDifference={(amount) => (
                        <CostValue cost={{ state: 'estimated', amount }} />
                    )}
                    caption={changeCaption(range)}
                />
            }
            detail={
                unpriced_runs > 0
                    ? `${formatCount(unpriced_runs)} unpriced ${unpriced_runs === 1 ? 'run' : 'runs'}`
                    : undefined
            }
        >
            <CostValue cost={summary.cost} />
        </Metric>
    )
}
