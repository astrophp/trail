import { describe, expect, it } from 'vitest'
import type { SpendBucket, UsageSpendResponse } from '@/api/types'
import {
    hasRecordedAmount,
    spendChartInput,
} from '@/features/usage/spend-series'
import { spendFixture } from '@/test/usage-api'

const { data } = spendFixture
const recordedCount = data.series.buckets.length
const projection = data.projection

if (projection.state !== 'projected') {
    throw new Error('The fixture is projected.')
}

describe('spendChartInput', () => {
    const input = spendChartInput(data)

    it('puts the recorded buckets first and the projected ones after them, one bucket each', () => {
        expect(input.buckets).toHaveLength(
            recordedCount + projection.buckets.length,
        )
        expect(
            input.buckets.map((bucket) => bucket.from.toISOString()),
        ).toEqual([
            ...data.series.buckets.map((bucket) => bucket.from),
            ...projection.buckets.map((bucket) => bucket.from),
        ])
        expect(input.lastRecorded).toBe(recordedCount - 1)
    })

    it('draws the recorded line from the cumulative amounts as the response has them, with a gap before the first', () => {
        expect(input.recorded.values).toEqual(
            data.series.buckets.map((bucket) => bucket.cumulative.amount),
        )
        expect(input.recorded.values.slice(0, 20)).toEqual(
            Array<null>(20).fill(null),
        )
        expect(input.recorded.values.at(-1)).toBe(0.01315)
        expect(input.recorded.span).toEqual({ to: recordedCount - 1 })
    })

    it('draws the projected line from the projected cumulative amounts, starting at the last recorded point', () => {
        expect(input.projected?.values).toEqual([
            ...Array<null>(recordedCount - 1).fill(null),
            0.01315,
            ...projection.buckets.map((bucket) => bucket.cumulative),
        ])
        expect(input.projected?.values.at(-1)).toBe(0.05326624)
        expect(input.projected?.span).toEqual({ from: recordedCount - 1 })
    })

    it('starts the projected line where the recorded one ends, and not before', () => {
        const values = input.projected?.values ?? []

        expect(
            values.slice(0, recordedCount - 1).every((value) => value === null),
        ).toBe(true)
        expect(values[recordedCount - 1]).toBe(input.recorded.values.at(-1))
    })

    it('has no connecting point when the last recorded bucket has no amount', () => {
        const buckets = data.series.buckets.map((bucket, index): SpendBucket =>
            index === recordedCount - 1
                ? { ...bucket, cumulative: { state: 'unpriced', amount: null } }
                : bucket,
        )
        const unpriced = spendChartInput({
            ...data,
            series: { ...data.series, buckets },
        })

        expect(unpriced.projected?.values[recordedCount - 1]).toBeNull()
        expect(unpriced.projected?.values[recordedCount]).toBe(
            projection.buckets[0]?.cumulative,
        )
    })

    it('has no projected line, and only the recorded buckets, when there is no projection', () => {
        const without = spendChartInput({
            ...data,
            projection: {
                state: 'range_not_current',
                window: null,
                per_bucket: null,
                total: null,
                buckets: [],
                left_out: projection.left_out,
            },
        })

        expect(without.projected).toBeNull()
        expect(without.buckets).toHaveLength(recordedCount)
    })

    it('marks the bucket in progress as the response does, and no projected one', () => {
        const withProgress: UsageSpendResponse['data'] = {
            ...data,
            series: {
                ...data.series,
                buckets: data.series.buckets.map((bucket, index) => ({
                    ...bucket,
                    in_progress: index === recordedCount - 1,
                })),
            },
        }
        const flags = spendChartInput(withProgress).buckets.map(
            (bucket) => bucket.inProgress,
        )

        expect(flags.filter(Boolean)).toHaveLength(1)
        expect(flags[recordedCount - 1]).toBe(true)
    })

    it('labels the projected buckets as whole ones', () => {
        expect(
            input.labelled.slice(recordedCount).every((bucket) => bucket.full),
        ).toBe(true)
        expect(input.labelled).toHaveLength(input.buckets.length)
    })
})

describe('hasRecordedAmount', () => {
    it('is true when some bucket has an amount and false when none has', () => {
        expect(hasRecordedAmount(data.series.buckets)).toBe(true)
        expect(
            hasRecordedAmount(
                data.series.buckets.map((bucket): SpendBucket => ({
                    ...bucket,
                    cumulative: { state: 'not_captured', amount: null },
                })),
            ),
        ).toBe(false)
    })

    it('counts an amount of 0 as an amount', () => {
        expect(
            hasRecordedAmount([
                {
                    ...data.series.buckets[0],
                    cumulative: { state: 'estimated', amount: 0 },
                },
            ]),
        ).toBe(true)
    })
})
