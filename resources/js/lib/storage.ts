// localStorage (kept across visits) and sessionStorage (kept until the tab closes) for
// conveniences that must never get in the way: nothing here throws when storage is
// unavailable, full or blocked.

/** Which store: `local` by default, `session` for what should not outlive the browser session. */
export type StorageArea = 'local' | 'session'

// Reading the global itself can throw (blocked site data), so it is looked up inside each `try`.
const area = (which: StorageArea): Storage =>
    which === 'session' ? sessionStorage : localStorage

/** The text stored under `key`, or `null` when there is none or storage cannot be read. */
export function readStored(
    key: string,
    which: StorageArea = 'local',
): string | null {
    try {
        return area(which).getItem(key)
    } catch {
        return null
    }
}

export function writeStored(
    key: string,
    value: string,
    which: StorageArea = 'local',
): void {
    try {
        area(which).setItem(key, value)
    } catch {
        // The choice then lasts for this page only.
    }
}

export function removeStored(key: string, which: StorageArea = 'local'): void {
    try {
        area(which).removeItem(key)
    } catch {
        // Nothing to remove from.
    }
}
