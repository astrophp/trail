import { describe, expect, it } from 'vitest'
import { sparklinePath } from '@/components/patterns/sparkline-path'

/** Every number in a path, in order. */
const numbers = (path: string) =>
    (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)

describe('sparklinePath', () => {
    it('draws a rising line from the bottom left to the top right', () => {
        expect(sparklinePath([0, 5, 10])).toBe('M0 98L50 50L100 2')
    })

    it('draws a falling line the other way', () => {
        expect(sparklinePath([10, 0])).toBe('M0 2L100 98')
    })

    it('draws all equal values as a flat line at mid height', () => {
        expect(sparklinePath([4, 4, 4])).toBe('M0 50L50 50L100 50')
    })

    it('draws nothing for one value, none, or only missing ones', () => {
        expect(sparklinePath([])).toBe('')
        expect(sparklinePath([7])).toBe('')
        expect(sparklinePath([null])).toBe('')
        expect(sparklinePath([null, null, null])).toBe('')
        // Two steps, but only one value to put on them.
        expect(sparklinePath([null, 3])).toBe('')
    })

    it('breaks the line at a null in the middle and does not bridge it', () => {
        const path = sparklinePath([1, 2, null, 4, 5])

        expect(path).toBe('M0 98L25 74 M75 26L100 2')
        expect(path.match(/M/g)).toHaveLength(2)
    })

    it('starts and ends where the values do when there are nulls at the ends', () => {
        expect(sparklinePath([null, 1, 3, null])).toBe('M33.33 98L66.67 2')
    })

    it('draws a value alone between two breaks as a zero-length segment, so it does not vanish', () => {
        expect(sparklinePath([1, null, 5, null, 3])).toBe(
            'M0 98h0 M50 2h0 M100 50h0',
        )
    })

    it('never produces NaN or Infinity, whatever it is given', () => {
        for (const values of [
            [0, 0],
            [-3, -1, -2],
            [1e308, -1e308],
            [Number.NaN, 1, 2],
            [1, Number.POSITIVE_INFINITY, 3],
            [Number.NaN, Number.NaN],
            [0.1, 0.2, 0.3],
        ]) {
            const path = sparklinePath(values)

            expect(path).not.toMatch(/NaN|Infinity/)
            expect(numbers(path).every(Number.isFinite)).toBe(true)
        }
    })

    it('keeps every point inside the 100 × 100 space', () => {
        for (const value of numbers(sparklinePath([-5, 3, 12, -1, 7]))) {
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThanOrEqual(100)
        }
    })

    describe('from zero', () => {
        it('puts zero at the bottom, so the scale of a row starts there', () => {
            // The same shape, 1 and 500 high: from the lowest value they would be identical.
            expect(sparklinePath([1, 2, 1])).toBe(sparklinePath([4, 8, 4]))
            expect(sparklinePath([1, 2, 1], 'zero')).toBe(
                sparklinePath([4, 8, 4], 'zero'),
            )
            expect(sparklinePath([4, 8, 4], 'zero')).toBe('M0 50L50 2L100 50')
        })

        it('does not stretch a small difference to the height of the box', () => {
            // 3 and 4 runs in an hour: from the lowest value that is the whole box, from zero a ripple.
            expect(sparklinePath([3, 4, 3, 4])).toBe(
                'M0 98L33.33 2L66.67 98L100 2',
            )
            expect(sparklinePath([3, 4, 3, 4], 'zero')).toBe(
                'M0 26L33.33 2L66.67 26L100 2',
            )
        })

        it('leaves the default unchanged: from the lowest value', () => {
            expect(sparklinePath([3, 5, 9])).toBe(
                sparklinePath([3, 5, 9], 'range'),
            )
            expect(sparklinePath([3, 5, 9])).toBe('M0 98L50 66L100 2')
            expect(sparklinePath([3, 5, 9], 'zero')).toBe(
                'M0 66L50 44.67L100 2',
            )
        })

        it('draws nothing for a row of zeros or of nothing, and a flat row above zero as a line', () => {
            expect(sparklinePath([0, 0, 0], 'zero')).toBe('')
            expect(sparklinePath([null, 0, null, 0], 'zero')).toBe('')
            expect(sparklinePath([0, 0, 0])).toBe('M0 50L50 50L100 50')
            expect(sparklinePath([5, 5, 5], 'zero')).toBe('M0 2L50 2L100 2')
        })

        it('goes below the line for a value below zero, and keeps the point inside the box', () => {
            for (const value of numbers(
                sparklinePath([-5, 3, 12, -1, 7], 'zero'),
            )) {
                expect(value).toBeGreaterThanOrEqual(0)
                expect(value).toBeLessThanOrEqual(100)
            }
        })
    })

    it('treats a value that is not a finite number as a break, not as 0', () => {
        expect(sparklinePath([1, Number.NaN, 3, 4])).toBe(
            sparklinePath([1, null, 3, 4]),
        )
    })
})
