import { useCallback, useLayoutEffect, useRef } from 'react'
import {
    turnDomId,
    turnHeadingDomId,
} from '@/features/conversations/transcript-turns'

type Held = { id: string; top: number }

/**
 * Turns put before the ones on screen would push the reader's place down the page. Call
 * `remember` with the first turn shown, just before asking for earlier ones: when the first turn
 * becomes another, the page is scrolled by the distance that turn's neighbour moved, so what the
 * reader was looking at stays where it was, and focus moves to the heading of the first turn that
 * was added (without scrolling, which would undo the above). Call `forget` when the load failed.
 */
export function usePrependAnchor(firstId: string | undefined) {
    const held = useRef<Held | null>(null)

    const remember = useCallback((id: string) => {
        const element = document.getElementById(turnDomId(id))

        held.current = element
            ? { id, top: element.getBoundingClientRect().top }
            : null
    }, [])

    const forget = useCallback(() => {
        held.current = null
    }, [])

    useLayoutEffect(() => {
        const anchor = held.current

        if (anchor === null || firstId === undefined || firstId === anchor.id) {
            return
        }

        held.current = null

        const element = document.getElementById(turnDomId(anchor.id))

        if (element) {
            const moved = element.getBoundingClientRect().top - anchor.top

            if (moved !== 0) {
                window.scrollBy(0, moved)
            }
        }

        document
            .getElementById(turnHeadingDomId(firstId))
            ?.focus({ preventScroll: true })
    }, [firstId])

    return { remember, forget }
}
