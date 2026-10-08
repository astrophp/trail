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

    it('treats a value that is not a finite number as a break, not as 0', () => {
        expect(sparklinePath([1, Number.NaN, 3, 4])).toBe(
            sparklinePath([1, null, 3, 4]),
        )
    })
})
