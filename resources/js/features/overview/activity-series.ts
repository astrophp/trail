import type { BucketUnit, SeriesBucket, Summary } from '@/api/types'
import type {
    ChartBucket,
    ChartSeries,
} from '@/components/patterns/time-series-chart'
import { formatCost, formatCount, formatDurationFromZero } from '@/lib/format'
import type { ActivityMode } from '@/features/overview/activity-mode'

/** What each series is called, in the legend, the table and the chart's text equivalent. */
export const seriesLabels = {
    failed: 'Failed',
    incomplete: 'Incomplete',
    // Completed, running and awaiting approval: the label claims no more than that.
    other: 'Completed or in flight',
    duration: 'Avg duration',
    cost: 'Estimated cost',
} as const

/** The buckets of the series as the chart takes them: the part of the clock bucket inside the range. */
export function chartBuckets(buckets: SeriesBucket[]): ChartBucket[] {
    return buckets.map((bucket) => ({
        key: bucket.from,
        from: new Date(bucket.from),
        to: new Date(bucket.to),
        inProgress: bucket.in_progress,
    }))
}

/**
 * Failed, then incomplete, then the rest, bottom first. Incomplete runs are not failed runs, and
 * the rest is the runs of the bucket that are neither: the one subtraction of counts the client
 * makes.
 */
export function volumeSeries(buckets: SeriesBucket[]): ChartSeries[] {
    return [
        {
            key: 'failed',
            label: seriesLabels.failed,
            color: 'destructive',
            values: buckets.map((bucket) => bucket.runs.failed),
        },
        {
            key: 'incomplete',
            label: seriesLabels.incomplete,
            color: 'warning',
            values: buckets.map((bucket) => bucket.runs.incomplete),
        },
        {
            key: 'other',
            label: seriesLabels.other,
            color: 'chart-1',
            values: buckets.map(
                (bucket) =>
                    bucket.runs.all -
                    bucket.runs.failed -
                    bucket.runs.incomplete,
            ),
        },
    ]
}

/** The average duration of the runs of each bucket; a bucket where none was measured has no value. */
export function durationSeries(buckets: SeriesBucket[]): ChartSeries {
    return {
        key: 'duration',
        label: seriesLabels.duration,
        color: 'chart-2',
        values: buckets.map((bucket) =>
            bucket.duration.measured === 0 ? null : bucket.duration.average_ms,
        ),
    }
}

/** The cost amount of each bucket; a bucket with no amount has no value, never 0. */
export function costSeries(buckets: SeriesBucket[]): ChartSeries {
    return {
        key: 'cost',
        label: seriesLabels.cost,
        color: 'chart-3',
        values: buckets.map((bucket) => bucket.cost.amount),
    }
}

/** How many buckets carry an amount that is not final, and how many have none for want of a price. */
export function costCaveats(buckets: SeriesBucket[]): {
    partial: number
    pending: number
    unpriced: number
} {
    const count = (state: SeriesBucket['cost']['state']) =>
        buckets.filter((bucket) => bucket.cost.state === state).length

    return {
        partial: count('partial'),
        pending: count('pending'),
        unpriced: count('unpriced'),
    }
}

const plural = (count: number, one: string, many: string) =>
    `${formatCount(count)} ${count === 1 ? one : many}`

/** The line under the chart about amounts that are not final or are missing, or `null` when there is nothing to say. */
export function costCaveatNote(buckets: SeriesBucket[]): string | null {
    const { partial, pending, unpriced } = costCaveats(buckets)
    const notFinal = [
        partial > 0
            ? `${plural(partial, 'interval is', 'intervals are')} partly priced`
            : null,
        pending > 0
            ? `${plural(pending, 'interval is', 'intervals are')} still pending`
            : null,
    ].filter((clause) => clause !== null)
    const sentences = [
        notFinal.length === 0
            ? null
            : `Amounts are not final: ${notFinal.join(' and ')}.`,
        unpriced > 0
            ? `${plural(unpriced, 'interval has', 'intervals have')} no amount because ${unpriced === 1 ? 'its' : 'their'} usage could not be priced.`
            : null,
    ].filter((sentence) => sentence !== null)

    return sentences.length === 0 ? null : sentences.join(' ')
}

/** What one bucket is called in a sentence. */
export const bucketNames: Record<BucketUnit, string> = {
    '5m': '5-minute interval',
    hour: 'hour',
    day: 'day',
}

/** The short span a bucket covers, for the panel's description. */
export const bucketSpans: Record<BucketUnit, string> = {
    '5m': '5 minutes',
    hour: 'hour',
    day: 'day',
}

/**
 * The chart in words, from the summary the endpoint returned for the range: nothing is added up
 * here. It names every series the chart draws.
 */
export function activitySummary(
    mode: ActivityMode,
    summary: Summary,
    unit: BucketUnit,
): string {
    const bucket = bucketNames[unit]
    const all = plural(summary.runs.all, 'trace', 'traces')

    if (mode === 'volume') {
        return `${all} started in this range, ${formatCount(summary.runs.failed)} failed and ${formatCount(summary.runs.incomplete)} incomplete. For each ${bucket} the chart stacks ${seriesLabels.failed}, ${seriesLabels.incomplete} and ${seriesLabels.other}; ${seriesLabels.other} covers completed, running and awaiting-approval traces.`
    }

    if (mode === 'duration') {
        return `${seriesLabels.duration} of the traces started in each ${bucket}. ${formatCount(summary.duration.measured)} of the ${all} in this range have a measured duration; where none was measured there is no value.`
    }

    return `${seriesLabels.cost} of the traces started in each ${bucket}. ${formatCount(summary.cost_coverage.unpriced_runs)} of the ${all} in this range have steps that could not be priced; where there is no amount there is no value.`
}

/**
 * What a bucket with no value reads in the table and the tooltip. One word per mode, true for
 * every such bucket of it: a cost can be missing because it is unpriced, still pending or never
 * reported, and a duration because no run of the bucket finished with one.
 */
export const missingLabels: Record<ActivityMode, string> = {
    volume: 'No count',
    duration: 'No measured runs',
    cost: 'No amount',
}

/** A value of the chart as text; each series says which formatter it needs. */
export function formatActivityValue(value: number, seriesKey: string): string {
    if (seriesKey === 'duration') {
        return formatDurationFromZero(value)
    }

    if (seriesKey === 'cost') {
        return formatCost(value)
    }

    return formatCount(value)
}
