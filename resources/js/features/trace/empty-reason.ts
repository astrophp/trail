import type { CoverageItem, Span } from '@/api/types'

/**
 * Why a span with neither input nor output has none, as far as that can honestly be said: it has
 * not finished, payload capture stored nothing for the run, or there is simply nothing for this span.
 */
export function emptyReason(
    span: Pick<Span, 'status'>,
    payloads: Pick<CoverageItem, 'state'>,
): string {
    if (span.status === 'running') {
        return 'This span has not finished. Nothing more has been stored yet.'
    }

    if (payloads.state === 'not_captured') {
        return 'No payloads were stored for this run. Payload capture may be switched off (`trail.capture.enabled`).'
    }

    return 'No input or output was stored for this span.'
}
