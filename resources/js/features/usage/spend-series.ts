import type { SpendBucket, UsageSpendResponse } from '@/api/types'
import type {
    ChartBucket,
    ChartSeries,
} from '@/components/patterns/time-series-chart'
import { chartBuckets } from '@/components/telemetry/activity-series'

/** What the chart of the estimated cost is drawn from. */
export type SpendChartInput = {
    /** The recorded buckets, then the projected ones. */
    buckets: ChartBucket[]
    /** The recorded cumulative estimated cost, over the recorded buckets. */
    recorded: ChartSeries
    /** The projected line over the last recorded bucket and the projected ones; `null` when there is no projection. */
    projected: ChartSeries | null
    /** The position of the last recorded bucket: where the recorded series ends and the projection begins. */
    lastRecorded: number
    /** The buckets of the response a label is made for: the recorded ones and the projected ones, whole. */
    labelled: { from: string; to: string; full: boolean }[]
}

export const recordedLabel = 'Recorded'
export const projectedLabel = 'Projected'

/**
 * The response as the chart takes it. Every value is the response's own: the recorded line is each
 * bucket's `cumulative`, and the projected line each projected bucket's `cumulative`, which is
 * where the line continues and is not a cost. A bucket without an amount has no value, never 0.
 * The projected line begins at the last recorded point, when that has an amount, so the two meet.
 */
export function spendChartInput(
    data: UsageSpendResponse['data'],
): SpendChartInput {
    const { series, projection } = data
    const projected = projection.state === 'projected' ? projection.buckets : []
    const lastRecorded = series.buckets.length - 1
    const start = series.buckets.at(-1)?.cumulative.amount ?? null

    return {
        buckets: [
            ...chartBuckets(series.buckets),
            ...projected.map((bucket): ChartBucket => ({
                key: bucket.from,
                from: new Date(bucket.from),
                to: new Date(bucket.to),
                inProgress: false,
            })),
        ],
        recorded: {
            key: 'recorded',
            label: recordedLabel,
            color: 'chart-3',
            values: series.buckets.map((bucket) => bucket.cumulative.amount),
            span: { to: lastRecorded },
        },
        projected:
            projected.length === 0
                ? null
                : {
                      key: 'projected',
                      label: projectedLabel,
                      color: 'chart-4',
                      values: [
                          ...series.buckets.map((_, index) =>
                              index === lastRecorded ? start : null,
                          ),
                          ...projected.map((bucket) => bucket.cumulative),
                      ],
                      span: { from: lastRecorded },
                      // The first point only joins the dashed line to the recorded one.
                      anchor: lastRecorded,
                  },
        lastRecorded,
        labelled: [
            ...series.buckets,
            ...projected.map(({ from, to }) => ({ from, to, full: true })),
        ],
    }
}

/** Whether any bucket of the series has an amount to draw. */
export const hasRecordedAmount = (buckets: SpendBucket[]): boolean =>
    buckets.some((bucket) => bucket.cumulative.amount !== null)
