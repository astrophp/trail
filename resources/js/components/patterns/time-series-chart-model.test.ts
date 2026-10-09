import { describe, expect, it } from 'vitest'
import {
    buildChartModel,
    chartColorVariable,
    niceAxis,
    splitInProgress,
    thinTicks,
    type ChartSeries,
} from '@/components/patterns/time-series-chart-model'
import {
    formatBucket,
    formatTick,
    hourlyBuckets,
} from '@/components/patterns/time-series-chart-fixtures'

const series = (...values: (number | null)[][]): ChartSeries[] =>
    values.map((one, index) => ({
        key: `s${index}`,
        label: `Series ${index}`,
        color: 'chart-1',
        values: one,
    }))

function model(
    values: (number | null)[][],
    options: { stacked?: boolean; count?: number } = {},
) {
    return buildChartModel({
        buckets: hourlyBuckets(options.count ?? values[0]?.length ?? 0, false),
        series: series(...values),
        stacked: options.stacked ?? true,
        formatBucket,
        formatTick,
    })
}

describe('niceAxis', () => {
    it('ends at a round number at or above the maximum, from 0, in equal steps', () => {
        expect(niceAxis(30)).toEqual({ top: 30, ticks: [0, 10, 20, 30] })
        expect(niceAxis(26)).toEqual({ top: 30, ticks: [0, 10, 20, 30] })
        expect(niceAxis(3)).toEqual({ top: 3, ticks: [0, 1, 2, 3] })
        expect(niceAxis(1)).toEqual({
            top: 1,
            ticks: [0, 0.25, 0.5, 0.75, 1],
        })
    })

    it('works for small fractions without float noise', () => {
        expect(niceAxis(0.0466)).toEqual({
            top: 0.06,
            ticks: [0, 0.02, 0.04, 0.06],
        })
    })

    it('never repeats a tick, whatever the maximum', () => {
        for (const max of [0, -5, Number.NaN, 1e-300, 0.3, 7, 99_999, 1e12]) {
            const { ticks, top } = niceAxis(max)

            expect(new Set(ticks).size).toBe(ticks.length)
            expect(ticks.every(Number.isFinite)).toBe(true)
            expect(ticks[0]).toBe(0)
            expect(top).toBeGreaterThan(0)
            expect(ticks.at(-1)).toBeGreaterThanOrEqual(Math.min(top, 1))
        }
    })

    it('gives an axis with height and two ticks when there is nothing above 0', () => {
        expect(niceAxis(0)).toEqual({ top: 1, ticks: [0, 1] })
        expect(niceAxis(Number.NaN)).toEqual({ top: 1, ticks: [0, 1] })
    })
})

describe('buildChartModel', () => {
    it('is empty with no buckets, and when no bucket has a value', () => {
        expect(model([[]]).status).toBe('empty')
        expect(model([[null, null, null]]).status).toBe('empty')
        expect(model([[null], [null]], { count: 1 }).status).toBe('empty')
    })

    it('is not empty when one value was captured, even if it is 0', () => {
        expect(model([[null, 0, null]]).status).toBe('zero')
        expect(model([[null, 3, null]]).status).toBe('data')
    })

    it('is zero only when every captured value is 0', () => {
        expect(model([[0, 0, 0]]).status).toBe('zero')
        expect(model([[0, 0, 1]]).status).toBe('data')
        expect(
            model([
                [0, 0],
                [0, 0],
            ]).status,
        ).toBe('zero')
    })

    it('keeps a null as null, never as 0', () => {
        const built = model([[1, null, 0]])

        expect(built.rows.map((row) => row.values[0])).toEqual([1, null, 0])
    })

    it('treats a value that is not a finite number as not captured', () => {
        const built = model([[1, Number.NaN, Number.POSITIVE_INFINITY]])

        expect(built.rows.map((row) => row.values[0])).toEqual([1, null, null])
        expect(built.axis.ticks.every(Number.isFinite)).toBe(true)
    })

    it('reads a series shorter than the buckets as not captured', () => {
        const built = buildChartModel({
            buckets: hourlyBuckets(3, false),
            series: series([4]),
            stacked: true,
            formatBucket,
            formatTick,
        })

        expect(built.rows.map((row) => row.values[0])).toEqual([4, null, null])
    })

    it('sizes the axis by the stack when stacked, and by the tallest value otherwise', () => {
        const values = [
            [10, 2],
            [5, 9],
        ]

        expect(model(values, { stacked: true }).axis.top).toBe(15)
        expect(model(values, { stacked: false }).axis.top).toBe(10)
    })

    it('carries the labels the caller made and whether a bucket is in progress', () => {
        const built = buildChartModel({
            buckets: hourlyBuckets(2, true),
            series: series([1, 2]),
            stacked: true,
            formatBucket,
            formatTick,
        })

        expect(built.rows.map((row) => row.tick)).toEqual(['06:00', '07:00'])
        expect(built.rows[1]?.label).toBe('Jan 5, 07:00–08:00')
        expect(built.rows.map((row) => row.inProgress)).toEqual([false, true])
    })
})

describe('buildChartModel: numbers that cannot go on an axis from 0', () => {
    it('treats a negative value as not captured', () => {
        const built = model([[3, -1, 0]])

        expect(built.rows.map((row) => row.values[0])).toEqual([3, null, 0])
        expect(built.status).toBe('data')
    })

    it('is empty when every value is negative, not zero', () => {
        expect(model([[-1, -2]]).status).toBe('empty')
        expect(model([[-1, 0]]).status).toBe('zero')
    })

    it('is empty, with a finite axis, when a stack adds up past the largest number', () => {
        const built = model([[1e308], [1e308]])

        expect(built.status).toBe('empty')
        expect(built.axis.ticks.every(Number.isFinite)).toBe(true)
        expect(Number.isFinite(built.axis.top)).toBe(true)
    })

    it('is empty when the top of the axis would pass the largest number', () => {
        const built = model([[1.7e308]], { stacked: false })

        expect(built.status).toBe('empty')
        expect(Number.isFinite(built.axis.top)).toBe(true)
    })

    it('does not let one overflowing bucket hide behind the others', () => {
        expect(
            model([
                [1, 1e308],
                [1, 1e308],
            ]).status,
        ).toBe('empty')
    })

    it('draws a value an axis can hold, however large', () => {
        const built = model([[1e300]], { stacked: false })

        expect(built.status).toBe('data')
        expect(Number.isFinite(built.axis.top)).toBe(true)
    })
})

describe('thinTicks', () => {
    const labels = Array.from({ length: 24 }, () => '00:00')

    it('keeps every label when there is room', () => {
        expect(thinTicks(labels, 2_000)).toEqual(labels.map((_, i) => i))
    })

    it('keeps every n-th label, counted back from the newest, when there is not', () => {
        // A slot is 5 characters of 7 plus a gap of 12: 47. Room for 6 of them, so every 4th.
        expect(thinTicks(labels, 300)).toEqual([3, 7, 11, 15, 19, 23])
    })

    it('always keeps the last label, even with no room at all', () => {
        expect(thinTicks(labels, 0)).toEqual([23])
        expect(thinTicks(labels, -10)).toEqual([23])
    })

    it('never leaves two kept labels closer than a slot', () => {
        const slot = 5 * 7 + 12

        for (const width of [60, 120, 250, 400, 800]) {
            const kept = thinTicks(labels, width)
            const gaps = kept.slice(1).map((index, at) => index - kept[at])

            expect(kept.at(-1)).toBe(23)
            expect(new Set(gaps).size).toBeLessThanOrEqual(1)

            for (const gap of gaps) {
                expect(gap * (width / labels.length)).toBeGreaterThanOrEqual(
                    slot,
                )
            }
        }
    })

    it('makes room for a longer label', () => {
        const long = Array.from({ length: 24 }, () => 'Jan 5, 06:00')

        expect(thinTicks(long, 300).length).toBeLessThan(
            thinTicks(labels, 300).length,
        )
    })

    it('has nothing to keep without labels', () => {
        expect(thinTicks([], 300)).toEqual([])
    })
})

describe('splitInProgress', () => {
    it('keeps the complete values solid and gives the last complete one to the dashed part', () => {
        expect(
            splitInProgress([1, 2, 3, 4], [false, false, false, true]),
        ).toEqual({
            solid: [1, 2, 3, null],
            pending: [null, null, 3, 4],
        })
    })

    it('has nothing pending when nothing is in progress', () => {
        expect(splitInProgress([1, null, 3], [false, false, false])).toEqual({
            solid: [1, null, 3],
            pending: [null, null, null],
        })
    })

    it('does not bridge to an in-progress bucket that has no value, or from one that has none', () => {
        expect(splitInProgress([1, 2, null], [false, false, true])).toEqual({
            solid: [1, 2, null],
            pending: [null, null, null],
        })
        expect(splitInProgress([null, 2], [false, true])).toEqual({
            solid: [null, null],
            pending: [null, 2],
        })
    })
})

describe('chartColorVariable', () => {
    it('maps every token to a CSS variable, never to a colour value', () => {
        for (const color of [
            'chart-1',
            'chart-5',
            'destructive',
            'warning',
            'success',
            'info',
        ] as const) {
            expect(chartColorVariable(color)).toBe(`var(--${color})`)
        }
    })
})
