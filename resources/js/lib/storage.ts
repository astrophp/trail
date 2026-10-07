// localStorage for conveniences that must never get in the way: nothing here
// throws when storage is unavailable, full or blocked.

/** The text stored under `key`, or `null` when there is none or storage cannot be read. */
export function readStored(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

export function writeStored(key: string, value: string): void {
    try {
        localStorage.setItem(key, value)
    } catch {
        // The choice then lasts for this page only.
    }
}

export function removeStored(key: string): void {
    try {
        localStorage.removeItem(key)
    } catch {
        // Nothing to remove from.
    }
}
