import type {
    BucketUnit,
    ProjectionLeftOut,
    SpendProjection,
    UsageSpendResponse,
} from '@/api/types'
import { formatCount } from '@/lib/format'

/** The most history a projection is made from, and the least: it needs this many buckets with usage. */
const neededWithUsage = 3

/** One bucket of each unit in a sentence, and several. */
const completeBuckets: Record<BucketUnit, { one: string; other: string }> = {
    '5m': {
        one: 'complete 5-minute bucket',
        other: 'complete 5-minute buckets',
    },
    hour: { one: 'complete hour', other: 'complete hours' },
    day: { one: 'complete day', other: 'complete days' },
}

/** The last complete buckets: `the last complete day`, `the last 6 complete days`. */
function lastComplete(count: number, unit: BucketUnit): string {
    const noun = completeBuckets[unit]

    return count === 1
        ? `the last ${noun.one}`
        : `the last ${formatCount(count)} ${noun.other}`
}

/**
 * What the projection assumed and the window it was taken from, from the response as it is: the
 * buckets are counted, never turned into a length of time.
 */
export function assumptionSentence(
    unit: BucketUnit,
    window: { buckets: number; with_usage: number },
): string {
    return `Projected from the tokens recorded in ${lastComplete(window.buckets, unit)} (${formatCount(window.with_usage)} with usage), priced at the prices saved now. Recorded costs do not change when a price changes.`
}

/** How much of the window had recorded usage, in a clause: any count of buckets, with any count having some. */
function historyClause(
    unit: BucketUnit,
    window: { buckets: number; with_usage: number },
): string {
    const { buckets, with_usage: some } = window

    if (buckets === 1) {
        return `${lastComplete(1, unit)} ${some === 0 ? 'has no' : 'has'} recorded usage`
    }

    const of = lastComplete(buckets, unit)

    if (some === 0) {
        return `none of ${of} have recorded usage`
    }

    return `${formatCount(some)} of ${of} ${some === 1 ? 'has' : 'have'} recorded usage`
}

/** Why there is no projection, when there is none. `null` when there is one. */
export function noProjectionSentence(
    unit: BucketUnit,
    projection: SpendProjection,
): string | null {
    if (projection.state === 'projected') {
        return null
    }

    if (projection.state === 'range_not_current') {
        return 'A projection is only made for a range that ends now.'
    }

    const { window } = projection

    if (window === null) {
        return `Not enough recent usage to project: no ${completeBuckets[unit].one} yet.`
    }

    // Enough buckets had usage, so what was missing was a price.
    if (window.with_usage >= neededWithUsage) {
        return `None of the usage in ${lastComplete(window.buckets, unit)} has a price, so nothing is projected.`
    }

    return `Not enough recent usage to project: ${historyClause(unit, window)}; ${neededWithUsage} are needed.`
}

const parts = (count: number, one: string, other: string) =>
    `${formatCount(count)} ${count === 1 ? one : other}`

/** What the window held and the rate does not include, in words; `null` when it left nothing out. */
export function leftOutSentence(leftOut: ProjectionLeftOut): string | null {
    const said: string[] = []

    if (leftOut.unpriced_steps > 0) {
        const steps = parts(
            leftOut.unpriced_steps,
            'unpriced step',
            'unpriced steps',
        )

        said.push(
            leftOut.unpriced_tokens === null
                ? steps
                : `${steps} (${parts(leftOut.unpriced_tokens, 'token', 'tokens')})`,
        )
    }

    if (leftOut.unfinished_runs > 0) {
        said.push(
            `${parts(leftOut.unfinished_runs, 'run', 'runs')} still in flight`,
        )
    }

    return said.length === 0 ? null : `Left out: ${said.join(' and ')}.`
}

/** What one bucket is called, singular. */
const bucketNoun: Record<BucketUnit, string> = {
    '5m': '5-minute bucket',
    hour: 'hour',
    day: 'day',
}

/** What a chart of the estimated cost says, for assistive technology and the table's caption. */
export function spendSummary(
    data: UsageSpendResponse['data'],
    period: string,
): string {
    const projected = data.projection.state === 'projected'

    return `Cumulative estimated cost recorded through each ${bucketNoun[data.series.bucket]} of the range.${projected ? ` A dashed line continues it as a projection for the next ${period}; a projection is not a cost.` : ''} Where there is no amount, there is no value.`
}

/** The caption of the table behind the chart. */
export function spendTableCaption(unit: BucketUnit): string {
    return `Estimated cost recorded in each ${bucketNoun[unit]} of the range, then the projected amount of each ${bucketNoun[unit]} after it. Recorded and projected amounts are in separate columns; a projection is not a cost.`
}
