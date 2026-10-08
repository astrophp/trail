import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import type { traceParams } from '@/features/trace/trace-params'
import { useIsMobile } from '@/hooks/use-mobile'
import type { SetUrlState } from '@/hooks/use-url-state'

/**
 * How selecting a span writes to the history. A selection replaces the entry, so choosing spans
 * does not bury the list under entries; the exception is a narrow screen, where opening the
 * evidence (the span going from none to one) adds one entry, so Back returns to the tree.
 *
 * `back` is the evidence's own back action: it does what Back does when the page added the entry
 * itself, and otherwise (the page was opened on a span) clears the span in place.
 */
export function useSpanSelection(
    span: string,
    setParams: SetUrlState<typeof traceParams>,
) {
    const narrow = useIsMobile()
    const navigate = useNavigate()
    const pushed = useRef(false)

    // With no span there is no entry of ours left to go back over.
    useEffect(() => {
        if (span === '') {
            pushed.current = false
        }
    }, [span])

    const write = useCallback(
        (patch: Parameters<typeof setParams>[0]) => {
            // The URL as it is now, not as it was at the last render.
            const opening =
                narrow &&
                (new URLSearchParams(window.location.search).get('span') ??
                    '') === '' &&
                patch.span !== undefined &&
                patch.span !== ''

            if (opening) {
                pushed.current = true
            }

            setParams(patch, { replace: !opening })
        },
        [narrow, setParams],
    )

    const back = useCallback(() => {
        if (pushed.current) {
            pushed.current = false
            void navigate(-1)
        } else {
            setParams({ span: '' }, { replace: true })
        }
    }, [navigate, setParams])

    return { write, back }
}
