import { useEffect, useState } from 'react'

/**
 * The content width of an element, kept up to date as it resizes. Give the returned `ref` to the
 * element. It is observed whenever it is on the page, however late it appears, and no longer once
 * it is gone. `initial` is used until the element has been measured, and stays when the
 * environment cannot measure (no `ResizeObserver`).
 */
export function useElementWidth(
    initial: number,
): [ref: (node: HTMLElement | null) => void, width: number] {
    const [node, setNode] = useState<HTMLElement | null>(null)
    const [width, setWidth] = useState(initial)

    useEffect(() => {
        if (!node || typeof ResizeObserver === 'undefined') {
            return
        }

        const observer = new ResizeObserver((entries) => {
            const next = entries[0]?.contentRect.width

            if (next !== undefined) {
                setWidth(next)
            }
        })

        observer.observe(node)

        return () => observer.disconnect()
    }, [node])

    return [setNode, width]
}
