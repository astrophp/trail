import { useCallback, useEffect, useRef, useState } from 'react'
import {
    turnDomId,
    turnHeadingDomId,
} from '@/features/conversations/transcript-turns'

/** How long a turn the reader was taken to stays highlighted. */
export const markedFor = 2_000

/**
 * Takes the reader to a turn: scrolls it into view, moves focus to its heading (so a screen
 * reader says where it is, and the highlight is not the only sign) and highlights it for a
 * moment. `turn` is the turn the address names: when it is on the page and the page has not
 * taken the reader to it yet, that happens, which covers arriving, reloading, and Back and
 * Forward. `arrive` takes the reader to a turn the page itself chose (the side list), and is
 * remembered, so the address that follows does not do it a second time.
 *
 * The move waits a microtask: the shell moves focus to the page heading and the scroll to the top
 * when the page changes, in an effect of its own that runs after this one in the same commit.
 */
export function useTurnArrival(turn: string) {
    const handled = useRef('')
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const [marked, setMarked] = useState<string | null>(null)

    const arrive = useCallback((id: string) => {
        handled.current = id
        document
            .getElementById(turnDomId(id))
            ?.scrollIntoView({ block: 'start' })
        document
            .getElementById(turnHeadingDomId(id))
            ?.focus({ preventScroll: true })
        setMarked(id)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setMarked(null), markedFor)
    }, [])

    useEffect(() => {
        if (
            turn === '' ||
            handled.current === turn ||
            document.getElementById(turnDomId(turn)) === null
        ) {
            return
        }

        let cancelled = false

        queueMicrotask(() => {
            if (!cancelled) {
                arrive(turn)
            }
        })

        return () => {
            cancelled = true
        }
    }, [turn, arrive])

    useEffect(() => () => clearTimeout(timer.current), [])

    return { marked, arrive }
}
