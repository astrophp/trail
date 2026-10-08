import type { Span } from '@/api/types'

/** A real, finite number. */
const finite = (value: number | null): value is number =>
    value !== null && Number.isFinite(value)

/**
 * The length in milliseconds of the time axis every bar of a run is drawn on. It is the run's own
 * duration, raised to the latest end (`offset_ms + duration_ms`) of any finished span that has
 * both, so no captured bar overflows it, and to the latest start of a running span, whose bar is
 * open-ended from there. A span that starts before the run still counts through its end. A run
 * without a duration gets the latest of those. `null` when nothing was captured or the axis would
 * have no length. Only captured values are used: a number that is not finite is ignored, as is a
 * negative duration, and a finished span with only one of the two says nothing about the axis.
 */
export function timingAxis(
    runDurationMs: number | null,
    spans: readonly Pick<Span, 'offset_ms' | 'duration_ms' | 'status'>[],
): number | null {
    let axis =
        finite(runDurationMs) && runDurationMs >= 0 ? runDurationMs : null

    for (const span of spans) {
        let end: number | null = null

        if (span.status === 'running') {
            end = finite(span.offset_ms) ? span.offset_ms : null
        } else if (
            finite(span.offset_ms) &&
            finite(span.duration_ms) &&
            span.duration_ms >= 0
        ) {
            end = span.offset_ms + span.duration_ms
        }

        if (
            end !== null &&
            Number.isFinite(end) &&
            (axis === null || end > axis)
        ) {
            axis = end
        }
    }

    // An axis of no length has nothing to draw on.
    return axis === null || axis <= 0 ? null : axis
}
