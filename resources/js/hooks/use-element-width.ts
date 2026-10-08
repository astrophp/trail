import { useEffect, useState, type RefObject } from 'react'

/**
 * The content width of an element, kept up to date as it resizes. `initial` is used until the
 * element has been measured, and stays when the environment cannot measure (no `ResizeObserver`).
 */
export function useElementWidth(
    ref: RefObject<HTMLElement | null>,
    initial: number,
): number {
    const [width, setWidth] = useState(initial)

    useEffect(() => {
        const element = ref.current

        if (!element || typeof ResizeObserver === 'undefined') {
            return
        }

        const observer = new ResizeObserver((entries) => {
            const next = entries[0]?.contentRect.width

            if (next !== undefined) {
                setWidth(next)
            }
        })

        observer.observe(element)

        return () => observer.disconnect()
    }, [ref])

    return width
}
