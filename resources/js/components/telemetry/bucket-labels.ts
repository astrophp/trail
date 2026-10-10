import type { BucketUnit, SeriesBucket } from '@/api/types'
import type { ChartBucket } from '@/components/patterns/time-series-chart'
import {
    formatClockTime,
    formatDuration,
    formatHoursAndMinutes,
    formatShortDate,
    isSameDay,
} from '@/lib/format'

const clock = formatHoursAndMinutes

/** How long a bucket of each unit is, unless the clock was changed inside it. */
const nominalLength: Record<BucketUnit, number> = {
    '5m': 300_000,
    hour: 3_600_000,
    day: 86_400_000,
}

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
    buckets: Pick<SeriesBucket, 'from' | 'to' | 'full'>[],
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

            const full = byKey.get(bucket.key)?.full === true
            const length = bucket.to.getTime() - bucket.from.getTime()
            // A whole bucket that is not as long as its unit is one a clock change touched: the
            // repeated hour is one bucket of two hours, a day is 23 or 25 hours. Say how long.
            const odd =
                full && length !== nominalLength[unit]
                    ? ` (${formatDuration(length)})`
                    : ''

            if (unit === 'day') {
                return full ? `${date}${odd}` : `${date}, ${span}`
            }

            return `${crossesMidnight ? `${date}, ${span}` : span}${odd}`
        },
    }
}

/** The line under a chart of buckets: which clock their edges follow. */
export function timeZoneNote(timeZone: string | undefined): string {
    return timeZone === undefined
        ? 'Buckets are shown in your local time zone.'
        : `Buckets follow the application’s time zone (${timeZone}).`
}
