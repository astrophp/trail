import { useEffect, useRef } from 'react'
import { focusPageHeading } from '@/lib/focus-page-heading'

/**
 * Pass whether what is on screen holds a control the person may be using (a retry button, the
 * action of an empty state). When that goes away and focus has fallen to the page body with it,
 * focus moves to the page heading instead. Focus that is anywhere else is left alone.
 */
export function useFocusHandoff(holdsControl: boolean): void {
    const held = useRef(false)

    useEffect(() => {
        const lost =
            document.activeElement === null ||
            document.activeElement === document.body

        if (held.current && !holdsControl && lost) {
            focusPageHeading()
        }

        held.current = holdsControl
    }, [holdsControl])
}
