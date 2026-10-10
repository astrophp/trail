import type { Span } from '@/api/types'

export type Truncation = {
    truncated: boolean
    /** The length before the cut, only when the span names exactly this path. */
    originalLength: number | undefined
}

/** Whether a cut path is the path or lies inside it (`input.messages` holds `input.messages.0.content`). */
export function within(cut: string, path: string): boolean {
    return path === '' || cut === path || cut.startsWith(`${path}.`)
}

/**
 * What a viewer showing the value at `path` should say about being cut short. It is cut when the
 * span names that path or a path inside it; the original length is known only for an exact match.
 */
export function truncationAt(
    paths: Span['truncated_paths'],
    path: string,
): Truncation {
    const cuts = Object.keys(paths)

    return {
        truncated: cuts.some((cut) => within(cut, path)),
        originalLength: Object.hasOwn(paths, path) ? paths[path] : undefined,
    }
}
