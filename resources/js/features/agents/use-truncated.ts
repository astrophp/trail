import { useEffect, useState } from 'react'

/**
 * Whether the text of an element is cut off by its own width (`truncate`), kept up to date as it
 * resizes and as its `text` changes. Give the returned `ref` to the element. Where the
 * environment cannot measure (no `ResizeObserver`: a test DOM), nothing is reported as cut.
 */
export function useTruncated(
    text: string,
): [ref: (node: HTMLElement | null) => void, truncated: boolean] {
    const [node, setNode] = useState<HTMLElement | null>(null)
    const [truncated, setTruncated] = useState(false)

    useEffect(() => {
        if (!node || typeof ResizeObserver === 'undefined') {
            return
        }

        // An observer reports once when it starts, and again at every change of size, so the
        // first measure and every later one are made in its callback.
        const observer = new ResizeObserver(() =>
            setTruncated(node.scrollWidth > node.clientWidth),
        )

        observer.observe(node)

        return () => observer.disconnect()
        // A new text under the same width is looked at again by observing again.
    }, [node, text])

    return [setNode, truncated]
}
