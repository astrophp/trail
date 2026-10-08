import type { Span } from '@/api/types'
import type { TabId } from '@/features/trace/evidence-tabs'

export type Truncation = {
    truncated: boolean
    /** The length before the cut, only when the span names exactly this path. */
    originalLength: number | undefined
}

/** Whether a cut path is the path or lies inside it (`input.messages` holds `input.messages.0.content`). */
function within(cut: string, path: string): boolean {
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

/**
 * The paths of the payloads a tab shows in viewers. `null` for the raw tab, whose viewer shows the
 * whole span and so says everything itself.
 */
function shownRoots(span: Pick<Span, 'type'>, tab: TabId): string[] | null {
    switch (tab) {
        case 'input':
            // Embeddings store a count and a size, not a payload to cut.
            return span.type === 'embedding' ? [] : ['input']
        case 'output':
            return span.type === 'embedding' ? [] : ['output']
        case 'metadata':
            return ['metadata']
        case 'raw':
            return null
    }
}

/**
 * Whether the page should say, once, that part of the span was cut short: the span was truncated
 * but no cut part is in a viewer on this tab (it is on another tab, in the error message, or its
 * path was not kept).
 */
export function truncationUnseen(
    span: Pick<Span, 'type' | 'truncated' | 'truncated_paths'>,
    tab: TabId,
): boolean {
    const roots = shownRoots(span, tab)

    if (!span.truncated || roots === null) {
        return false
    }

    return !Object.keys(span.truncated_paths).some((cut) =>
        roots.some((root) => within(cut, root)),
    )
}
