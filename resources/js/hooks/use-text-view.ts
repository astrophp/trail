import { useSyncExternalStore } from 'react'
import { readStored, writeStored } from '@/lib/storage'

/** How a markdown text is shown: drawn, or exactly as stored. */
export type TextView = 'rendered' | 'raw'

const storageKey = 'trail-text-view'

const listeners = new Set<() => void>()

// The choice for this page, which also holds when storage cannot be written.
let chosen: TextView | null = null

function read(): TextView {
    if (chosen !== null) {
        return chosen
    }

    return readStored(storageKey) === 'raw' ? 'raw' : 'rendered'
}

function subscribe(onChange: () => void) {
    // Another tab changed the choice.
    const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey) {
            chosen = null
            onChange()
        }
    }

    listeners.add(onChange)
    window.addEventListener('storage', onStorage)

    return () => {
        listeners.delete(onChange)
        window.removeEventListener('storage', onStorage)
    }
}

/**
 * How markdown texts are shown, and the setter. One choice for the whole dashboard: switching
 * one text switches every text on the page, and the browser remembers it.
 */
export function useTextView(): [TextView, (next: TextView) => void] {
    const view = useSyncExternalStore(subscribe, read)

    return [
        view,
        (next) => {
            chosen = next
            writeStored(storageKey, next)
            listeners.forEach((listener) => listener())
        },
    ]
}

/** Forgets the choice made on this page; for tests. */
export function resetTextView() {
    chosen = null
}
