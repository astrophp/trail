// Invented data for the chart's tests and catalogue. Formatting is pinned to UTC so the output is
// the same on every machine.
import type {
    ChartBucket,
    ChartSeries,
} from '@/components/patterns/time-series-chart-model'
import { formatClockTime, formatShortDate } from '@/lib/format'

const hour = 3_600_000
const start = Date.UTC(2026, 0, 5, 6)

/** `count` hourly buckets from 06:00 UTC on 5 Jan 2026. The last is still filling when asked. */
export function hourlyBuckets(count: number, lastInProgress = true) {
    return Array.from({ length: count }, (_, index): ChartBucket => ({
        key: `b${index}`,
        from: new Date(start + index * hour),
        to: new Date(start + (index + 1) * hour),
        inProgress: lastInProgress && index === count - 1,
    }))
}

export const formatTick = (bucket: ChartBucket) =>
    formatClockTime(bucket.from, 'UTC').slice(0, 5)

export const formatBucket = (bucket: ChartBucket) =>
    `${formatShortDate(bucket.from, 'UTC')}, ${formatClockTime(bucket.from, 'UTC').slice(0, 5)}–${formatClockTime(bucket.to, 'UTC').slice(0, 5)}`

export const formatValue = (value: number, seriesKey: string) =>
    seriesKey === 'level' ? `${value} lvl` : `${value} u`

export function barSeries(): ChartSeries[] {
    return [
        {
            key: 'alpha',
            label: 'Alpha',
            color: 'chart-1',
            values: [12, 18, 9, 22, 17, 25, 14, 8],
        },
        {
            key: 'beta',
            label: 'Beta',
            color: 'destructive',
            values: [1, 2, 0, 3, 1, null, 1, 0],
        },
        {
            key: 'gamma',
            label: 'Gamma',
            color: 'warning',
            values: [0, 1, 0, 2, 1, 0, 1, 2],
        },
    ]
}

export function lineSeries(): ChartSeries {
    return {
        key: 'level',
        label: 'Level',
        color: 'chart-2',
        values: [3.1, 2.8, null, 4.2, 3.9, null, 2.2, 2.6],
    }
}

export const words = {
    missingLabel: 'Not captured',
    emptyLabel: 'Nothing recorded in this range',
    zeroLabel: 'Every bucket is 0',
}
