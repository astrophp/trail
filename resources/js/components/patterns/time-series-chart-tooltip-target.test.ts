import { describe, expect, it } from 'vitest'
import { tooltipTarget } from '@/components/patterns/time-series-chart-tooltip-target'

// The props below are what Recharts 3.8 really passed to the tooltip's `content` in the browser
// (the catalogue's line chart, pointer over its in-progress bucket, over a bucket with no value,
// and away from the chart), with the payload cut down to the fields that matter.
const overInProgressPoint = {
    active: true,
    label: 7,
    activeIndex: '7',
    payload: [{ dataKey: 's0-pending', value: 2.6 }],
}
const overBucketWithNoValue = {
    active: true,
    label: 2,
    activeIndex: '2',
    payload: [],
}
const awayFromTheChart = { active: false, activeIndex: null, payload: [] }

describe('tooltipTarget', () => {
    it('reads the bucket from the label Recharts passes, a number', () => {
        expect(tooltipTarget(overInProgressPoint)).toEqual({
            active: true,
            index: 7,
        })
    })

    it('still finds the bucket when the payload is empty', () => {
        expect(tooltipTarget(overBucketWithNoValue)).toEqual({
            active: true,
            index: 2,
        })
    })

    it('is not active, and has no bucket, away from the chart', () => {
        expect(tooltipTarget(awayFromTheChart)).toEqual({
            active: false,
            index: undefined,
        })
    })

    it('falls back to the active index when there is no usable label', () => {
        expect(tooltipTarget({ active: true, activeIndex: '4' })).toEqual({
            active: true,
            index: 4,
        })
        expect(
            tooltipTarget({ active: true, label: 'nope', activeIndex: 3 }),
        ).toEqual({ active: true, index: 3 })
    })

    it('does not read a position that cannot be one', () => {
        for (const label of [-1, 1.5, Number.NaN, '', ' ', 'x', null, {}]) {
            expect(tooltipTarget({ active: true, label }).index).toBeUndefined()
        }
    })

    it('is active only when Recharts says so', () => {
        expect(tooltipTarget({ label: 1 }).active).toBe(false)
        expect(tooltipTarget({ active: false, label: 1 }).active).toBe(false)
    })
})
