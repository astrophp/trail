import { tracesLink } from '@/api/traces-link'
import type { Summary, UsageCoverage } from '@/api/types'
import { Metric } from '@/components/patterns/metric'
import { pricesHeadingId, reviewPrices } from '@/features/usage/prices-anchor'
import { formatCount, formatTokens } from '@/lib/format'
import type { TimeRangePreset } from '@/lib/time-range'

const plural = (count: number, one: string, other: string) =>
    `${formatCount(count)} ${count === 1 ? one : other}`

/**
 * How much of the usage could be priced, counted in what was left out and never as a share of the
 * money. It is built from the figures above zero, so it agrees with the cost beside it: the
 * unpriced runs lead (and link to those runs); when no run is unpriced but steps are, the steps
 * lead; the sub-line carries the other figures that are known and above zero (the tokens are
 * left out when the unpriced steps reported none). When something is unpriced it also leads to
 * the model prices on the same page, where a rate can be set. Only when there are no unpriced
 * runs and no unpriced steps does it say everything was priced, and "so far" while runs are
 * running.
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
    const pending =
        summary.cost.state === 'pending' || summary.usage.state === 'pending'

    if (unpriced_runs === 0 && unpriced_steps === 0) {
        return (
            <Metric label="Pricing coverage">
                <span className="text-ui font-normal">
                    {reported_steps === 0
                        ? 'No step reported usage'
                        : `Every step that reported usage was priced${pending ? ' so far' : ''}`}
                </span>
            </Metric>
        )
    }

    const known = [
        unpriced_runs > 0 && unpriced_steps > 0
            ? plural(unpriced_steps, 'step', 'steps')
            : null,
        unpriced_tokens !== null && unpriced_tokens > 0
            ? `${formatTokens(unpriced_tokens)} ${unpriced_tokens === 1 ? 'token' : 'tokens'}`
            : null,
    ].filter((figure) => figure !== null)

    return (
        <Metric
            label="Pricing coverage"
            to={
                unpriced_runs > 0
                    ? tracesLink(range, { unpriced: true })
                    : undefined
            }
            detail={
                known.length === 0 ? undefined : (
                    <>{known.join(' \u00b7 ')} without a rate</>
                )
            }
            action={
                <a
                    href={`#${pricesHeadingId}`}
                    onClick={reviewPrices}
                    className="rounded-sm underline underline-offset-4 hover:text-primary-ink"
                >
                    Review prices
                </a>
            }
        >
            {unpriced_runs > 0
                ? plural(unpriced_runs, 'unpriced run', 'unpriced runs')
                : plural(unpriced_steps, 'unpriced step', 'unpriced steps')}
        </Metric>
    )
}
