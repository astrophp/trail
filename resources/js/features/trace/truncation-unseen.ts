import type { Span } from '@/api/types'
import { within } from '@/components/telemetry/payload-truncation'
import type { TabId } from '@/features/trace/evidence-tabs'

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
