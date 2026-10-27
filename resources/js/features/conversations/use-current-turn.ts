import { useEffect, useState } from 'react'
import { turnDomId } from '@/features/conversations/transcript-turns'

/** How far below the top of the window a turn is read from: under the sticky top bar. */
const readingLine = 80

/** The first of `ids` whose article crosses the band from the reading line to the middle of the window. */
function crossing(ids: string[]): string | undefined {
    const bottom = window.innerHeight / 2
    const scrolled = document.scrollingElement?.scrollTop ?? 0
    const height = document.scrollingElement?.scrollHeight ?? 0

    // At the end of the page a short last turn never reaches the band: it is the one read.
    if (scrolled > 0 && scrolled + window.innerHeight >= height - 2) {
        const last = ids.at(-1)

        if (last !== undefined && document.getElementById(turnDomId(last))) {
            return last
        }
    }

    return ids.find((id) => {
        const box = document
            .getElementById(turnDomId(id))
            ?.getBoundingClientRect()

        return box !== undefined && box.bottom > readingLine && box.top < bottom
    })
}

/** Whether any of the turn's article is in the window, under the top bar. */
function inView(id: string): boolean {
    const box = document.getElementById(turnDomId(id))?.getBoundingClientRect()

    return (
        box !== undefined &&
        box.bottom > readingLine &&
        box.top < window.innerHeight
    )
}

/**
 * The turn being read: the first of `ids` (trace ids, in page order) whose article crosses the
 * band from under the top bar to the middle of the window. Worked out again as the page scrolls,
 * so turns drawn after the list arrived count too. `null` until one has been seen.
 *
 * `target` is the turn the reader was taken to (the address's turn). It is the current one for as
 * long as any of it is in view, even where the page cannot scroll it up to the band (a short last
 * turn); once it has been scrolled away, the band decides again.
 */
export function useCurrentTurn(
    ids: string[],
    target: string = '',
): string | null {
    const [current, setCurrent] = useState<string | null>(null)
    const key = ids.join(' ')

    useEffect(() => {
        if (key === '') {
            return
        }

        const order = key.split(' ')
        let pinned = order.includes(target) ? target : ''
        // The target is let go only once it has been in view and then scrolled away: the move
        // that takes the reader to it comes after the first look.
        let seen = false
        // Scroll events come at most once a frame; reading a few boxes each time is cheap.
        const update = () => {
            if (pinned !== '') {
                const visible = inView(pinned)

                if (visible || !seen) {
                    seen = seen || visible
                    setCurrent(pinned)

                    return
                }

                pinned = ''
            }

            // Between two turns nothing crosses the band; the last one read stays current.
            const found = crossing(order)

            if (found !== undefined) {
                setCurrent(found)
            }
        }
        // The turns may be drawn just after the list: look once they are on the page.
        const first = setTimeout(update, 0)

        window.addEventListener('scroll', update, { passive: true })
        window.addEventListener('resize', update)

        return () => {
            clearTimeout(first)
            window.removeEventListener('scroll', update)
            window.removeEventListener('resize', update)
        }
    }, [key, target])

    return current
}
