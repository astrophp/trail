import { tracesLink } from '@/api/traces-link'
import type { Summary, UsageCoverage } from '@/api/types'
import { Metric } from '@/components/patterns/metric'
import { formatCount, formatTokens } from '@/lib/format'
import type { TimeRangePreset } from '@/lib/time-range'

const plural = (count: number, one: string, other: string) =>
    `${formatCount(count)} ${count === 1 ? one : other}`

/**
 * How much of the usage could be priced, counted in what was left out: the runs, the steps and the
 * tokens that had no rate. It is never a share of the money. When the unpriced steps reported no
 * token count there is no token figure, rather than a zero or a made-up word. The runs lead to the
 * traces list kept to the runs with an unpriced step.
 */
export function CoverageMetric({
    summary,
    coverage,
    range,
}: {
    summary: Summary
    coverage: UsageCoverage
    range: TimeRangePreset
}) {
    const { unpriced_runs } = summary.cost_coverage
    const { unpriced_steps, unpriced_tokens, reported_steps } = coverage

    if (unpriced_steps === 0) {
        return (
            <Metric label="Pricing coverage">
                <span className="text-ui font-normal">
                    {reported_steps === 0
                        ? 'No step reported usage'
                        : 'Every step that reported usage was priced'}
                </span>
            </Metric>
        )
    }

    return (
        <Metric
            label="Pricing coverage"
            to={
                unpriced_runs > 0
                    ? tracesLink(range, { unpriced: true })
                    : undefined
            }
            detail={
                <>
                    {plural(unpriced_steps, 'step', 'steps')}
                    {unpriced_tokens === null
                        ? null
                        : ` · ${formatTokens(unpriced_tokens)} ${unpriced_tokens === 1 ? 'token' : 'tokens'}`}{' '}
                    without a rate
                </>
            }
        >
            {plural(unpriced_runs, 'run', 'runs')}
        </Metric>
    )
}
