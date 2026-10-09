import { useEffect, useRef, type RefObject } from 'react'
import { focusPageHeading } from '@/lib/focus-page-heading'

/**
 * Pass whether what is on screen holds a control the person may be using (a retry button, the
 * action of an empty state). When that goes away and focus has fallen to the page body with it,
 * focus moves to the page heading instead, or to `target` when the control sat in a part of the
 * page with a heading of its own. Focus that is anywhere else is left alone.
 */
export function useFocusHandoff(
    holdsControl: boolean,
    target?: RefObject<HTMLElement | null>,
): void {
    const held = useRef(false)

    useEffect(() => {
        const lost =
            document.activeElement === null ||
            document.activeElement === document.body

        if (held.current && !holdsControl && lost) {
            if (target?.current) {
                target.current.focus({ preventScroll: true })
            } else {
                focusPageHeading()
            }
        }

        held.current = holdsControl
    }, [holdsControl, target])
}
