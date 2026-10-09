import type { BucketUnit, SeriesBucket } from '@/api/types'
import type { ChartBucket } from '@/components/patterns/time-series-chart'
import { formatClockTime, formatShortDate, isSameDay } from '@/lib/format'

/** `14:05`: the clock time without its seconds, which no bucket edge has. */
const clock = (at: Date, timeZone: string | undefined) =>
    formatClockTime(at, timeZone).slice(0, 5)

/**
 * The words for the buckets of a series, in the application's time zone, which is the zone the
 * buckets' edges follow. `buckets` are the series' own: the first and last are cut by the range.
 *
 * - The tick under the axis is the bucket's start: the clock time for `5m` and `hour` buckets,
 *   the day for `day` buckets.
 * - The full label is the span the bucket covers, with its date when the range crosses midnight
 *   (a `day` bucket is its date, and its span as well when the range cut it).
 */
export function bucketLabels(
    unit: BucketUnit,
    buckets: SeriesBucket[],
    timeZone: string | undefined,
) {
    const byKey = new Map(buckets.map((bucket) => [bucket.from, bucket]))
    const first = buckets.at(0)
    const last = buckets.at(-1)
    // `to` is excluded: a range that ends at midnight does not reach the next day.
    const crossesMidnight =
        first !== undefined &&
        last !== undefined &&
        !isSameDay(
            new Date(first.from),
            new Date(Date.parse(last.to) - 1),
            timeZone,
        )

    return {
        formatTick: (bucket: ChartBucket) =>
            unit === 'day'
                ? formatShortDate(bucket.from, timeZone)
                : clock(bucket.from, timeZone),
        formatBucket: (bucket: ChartBucket) => {
            const date = formatShortDate(bucket.from, timeZone)
            // A bucket the range cut within one minute is told apart by its seconds.
            const withSeconds =
                clock(bucket.from, timeZone) === clock(bucket.to, timeZone)
            const edge = (at: Date) =>
                withSeconds
                    ? formatClockTime(at, timeZone)
                    : clock(at, timeZone)
            const span = `${edge(bucket.from)}–${edge(bucket.to)}`

            if (unit === 'day') {
                return byKey.get(bucket.key)?.full === false
                    ? `${date}, ${span}`
                    : date
            }

            return crossesMidnight ? `${date}, ${span}` : span
        },
    }
}
