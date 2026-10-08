import { describe, expect, it } from 'vitest'
import type { Status } from '@/api/types'
import { timingAxis } from '@/features/trace/timing-axis'

const span = (
    offset_ms: number,
    duration_ms: number | null,
    status: Status = 'completed',
) => ({ offset_ms, duration_ms, status })

describe('timingAxis', () => {
    it('is the span ends in the run when the run has a duration and nothing ends later', () => {
        expect(timingAxis(3000, [span(0, 3000), span(100, 840)])).toBe(3000)
    })

    it("is the run's own duration when it has one, even if no span has timing", () => {
        expect(timingAxis(3000, [span(0, null)])).toBe(3000)
    })

    it('is raised to the end of a span that ends after the run, so no bar overflows', () => {
        expect(timingAxis(1000, [span(900, 400), span(0, 500)])).toBe(1300)
    })

    it('is the latest span end for a run without a duration', () => {
        expect(timingAxis(null, [span(0, 200), span(150, 100)])).toBe(250)
    })

    it('is null when nothing was captured', () => {
        expect(timingAxis(null, [])).toBeNull()
        expect(timingAxis(null, [span(10, null), span(0, null)])).toBeNull()
    })

    it('is null for an axis of no length', () => {
        expect(timingAxis(0, [])).toBeNull()
        expect(timingAxis(null, [span(0, 0)])).toBeNull()
    })

    it('ignores values that are not finite or are negative', () => {
        expect(timingAxis(Number.NaN, [span(0, 400)])).toBe(400)
        expect(timingAxis(Infinity, [span(0, 400)])).toBe(400)
        expect(timingAxis(-5, [span(0, 400)])).toBe(400)
        expect(
            timingAxis(500, [
                span(Number.NaN, 9_000),
                span(0, Infinity),
                span(0, -9_000),
                span(Number.NaN, null, 'running'),
            ]),
        ).toBe(500)
        expect(timingAxis(Number.NaN, [span(Infinity, Infinity)])).toBeNull()
    })

    it('uses a span only when it has both an offset and a duration', () => {
        expect(timingAxis(null, [span(5_000, null), span(0, 100)])).toBe(100)
    })

    it('counts the end of a span that starts before the run, when that end is positive', () => {
        expect(timingAxis(null, [span(-10, 9_000)])).toBe(8_990)
        expect(timingAxis(500, [span(-10, 400)])).toBe(500)
        expect(timingAxis(null, [span(-500, 100)])).toBeNull()
    })

    it('is raised to the start of a running span, whose bar is open-ended', () => {
        expect(
            timingAxis(null, [span(0, 100), span(150, null, 'running')]),
        ).toBe(150)
        expect(
            timingAxis(null, [span(0, 100), span(50, null, 'running')]),
        ).toBe(100)
    })

    it('ignores the duration a running span holds', () => {
        expect(timingAxis(null, [span(10, 9_000, 'running')])).toBe(10)
    })

    it('stays null when everything is running and nothing starts after zero', () => {
        expect(
            timingAxis(null, [
                span(0, null, 'running'),
                span(0, null, 'running'),
            ]),
        ).toBeNull()
    })
})
