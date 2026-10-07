import { basePath } from '@/lib/base-path'

export type Recording = 'enabled' | 'paused' | 'disabled'

/** What the Blade page writes into `window.Trail` before the bundle runs. */
export type Boot = {
    /** The dashboard's base path, normalised: `/trail`, `/admin/trail`, or `/`. */
    path: string
    apiPath: string
    csrfToken: string | null
    appName: string | null
    environment: string
    timezone: string | null
    version: string | null
    staleAfter: number
    recording: Recording | null
}

declare global {
    interface Window {
        Trail?: unknown
    }
}

/** What stands in when the page did not provide a boot object (tests, the catalogue). */
const fallback: Boot = {
    path: '/trail',
    apiPath: '/trail/api',
    csrfToken: null,
    appName: null,
    environment: 'local',
    timezone: null,
    version: null,
    staleAfter: 3600,
    recording: null,
}

const recordings: readonly string[] = ['enabled', 'paused', 'disabled']

const text = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null

/** Turns whatever is in `window.Trail` into a boot object, field by field. */
export function parseBoot(source: unknown): Boot {
    if (typeof source !== 'object' || source === null) {
        return fallback
    }

    const raw = source as Record<string, unknown>
    const path =
        text(raw.path) === null ? fallback.path : basePath(text(raw.path)!)

    return {
        path,
        apiPath: text(raw.apiPath) ?? `${path === '/' ? '' : path}/api`,
        csrfToken: text(raw.csrfToken),
        appName: text(raw.appName),
        environment: text(raw.environment) ?? fallback.environment,
        timezone: text(raw.timezone),
        version: text(raw.version),
        staleAfter:
            typeof raw.staleAfter === 'number' && raw.staleAfter >= 0
                ? raw.staleAfter
                : fallback.staleAfter,
        recording:
            typeof raw.recording === 'string' &&
            recordings.includes(raw.recording)
                ? (raw.recording as Recording)
                : null,
    }
}

let booted: Boot | undefined

/** The boot object, read from the page on first use and kept after that. */
export function boot(): Boot {
    booted ??= parseBoot(window.Trail)

    return booted
}
