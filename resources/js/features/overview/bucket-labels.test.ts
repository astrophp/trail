import { describe, expect, it } from 'vitest'
import type { SeriesBucket } from '@/api/types'
import { chartBuckets } from '@/features/overview/activity-series'
import { bucketLabels } from '@/features/overview/bucket-labels'
import { overviewFixture } from '@/test/overview-api'

// An application zone that is neither UTC nor the machine's: a +3 offset all year.
const zone = 'Europe/Istanbul'

const empty = overviewFixture.data.series.buckets[0]

const bucket = (
    from: string,
    to: string,
    overrides: Partial<SeriesBucket> = {},
): SeriesBucket => ({ ...empty, from, to, full: true, ...overrides })

function labelsOf(
    unit: Parameters<typeof bucketLabels>[0],
    buckets: SeriesBucket[],
) {
    const { formatTick, formatBucket } = bucketLabels(unit, buckets, zone)

    return chartBuckets(buckets).map((one) => ({
        tick: formatTick(one),
        label: formatBucket(one),
    }))
}

describe('bucketLabels in the application zone', () => {
    it('labels 5-minute buckets by their clock time, the zone applied', () => {
        // 10:00 UTC is 13:00 in Istanbul.
        const buckets = [
            bucket('2026-01-02T10:00:00.000Z', '2026-01-02T10:05:00.000Z'),
            bucket('2026-01-02T10:05:00.000Z', '2026-01-02T10:10:00.000Z'),
        ]

        expect(labelsOf('5m', buckets)).toEqual([
            { tick: '13:00', label: '13:00–13:05' },
            { tick: '13:05', label: '13:05–13:10' },
        ])
    })

    it('labels hour buckets by their clock time, with the cut ends as the API cut them', () => {
        const buckets = [
            bucket('2026-01-02T10:23:00.000Z', '2026-01-02T11:00:00.000Z', {
                full: false,
            }),
            bucket('2026-01-02T11:00:00.000Z', '2026-01-02T12:00:00.000Z'),
        ]

        expect(labelsOf('hour', buckets)).toEqual([
            { tick: '13:23', label: '13:23–14:00' },
            { tick: '14:00', label: '14:00–15:00' },
        ])
    })

    it('adds the date to a span when the range crosses midnight of the application zone', () => {
        // 21:00 UTC on the 2nd is midnight of the 3rd in Istanbul.
        const buckets = [
            bucket('2026-01-02T20:00:00.000Z', '2026-01-02T21:00:00.000Z'),
            bucket('2026-01-02T21:00:00.000Z', '2026-01-02T22:00:00.000Z'),
        ]

        expect(labelsOf('hour', buckets)).toEqual([
            { tick: '23:00', label: 'Jan 2, 23:00–00:00' },
            { tick: '00:00', label: 'Jan 3, 00:00–01:00' },
        ])
    })

    it('does not cross midnight for a range that ends exactly on it', () => {
        const buckets = [
            bucket('2026-01-02T19:00:00.000Z', '2026-01-02T20:00:00.000Z'),
            bucket('2026-01-02T20:00:00.000Z', '2026-01-02T21:00:00.000Z'),
        ]

        expect(labelsOf('hour', buckets).map((one) => one.label)).toEqual([
            '22:00–23:00',
            '23:00–00:00',
        ])
    })

    it('labels day buckets by their date in that zone, and gives the span of one the range cut', () => {
        const buckets = [
            bucket('2026-01-01T12:20:00.000Z', '2026-01-01T21:00:00.000Z', {
                full: false,
            }),
            bucket('2026-01-01T21:00:00.000Z', '2026-01-02T21:00:00.000Z'),
            bucket('2026-01-02T21:00:00.000Z', '2026-01-03T12:20:00.000Z', {
                full: false,
            }),
        ]

        expect(labelsOf('day', buckets)).toEqual([
            { tick: 'Jan 1', label: 'Jan 1, 15:20–00:00' },
            { tick: 'Jan 2', label: 'Jan 2' },
            { tick: 'Jan 3', label: 'Jan 3, 00:00–15:20' },
        ])
    })

    it('names the day of the zone, not the day in UTC', () => {
        // 22:00 UTC on the 1st is already the 2nd in Istanbul.
        const buckets = [
            bucket('2026-01-01T21:00:00.000Z', '2026-01-02T21:00:00.000Z'),
        ]

        expect(labelsOf('day', buckets)[0]?.tick).toBe('Jan 2')
    })

    it('gives the seconds of a bucket the range cut inside one minute, so its ends are not the same', () => {
        const buckets = [
            bucket('2026-01-02T10:00:00.000Z', '2026-01-02T10:05:00.000Z'),
            bucket('2026-01-02T10:05:00.000Z', '2026-01-02T10:05:53.000Z', {
                full: false,
            }),
        ]

        expect(labelsOf('5m', buckets)).toEqual([
            { tick: '13:00', label: '13:00–13:05' },
            { tick: '13:05', label: '13:05:00–13:05:53' },
        ])
    })

    it('has nothing to label without buckets', () => {
        expect(labelsOf('hour', [])).toEqual([])
    })
})
