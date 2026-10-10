import type { Status } from '@/api/types'
import type { SpanNode, SpanTree } from '@/features/trace/build-span-tree'

/**
 * Where a failure started: the first failed span, in sequence order, that has no failed span under
 * it. A tool that threw is chosen over the agents that failed because of it; when only the root
 * failed, it is the root. `undefined` when no span failed.
 */
function whereItFailed(tree: SpanTree): SpanNode | undefined {
    // A span has a failed span under it when any child failed or has one under it. Children come
    // after their parent in tree order, so walking backwards sees them first.
    const failedBelow = new Set<string>()

    for (let i = tree.nodes.length - 1; i >= 0; i--) {
        const node = tree.nodes[i]

        if (
            node.children.some(
                (child) =>
                    child.span.status === 'failed' ||
                    failedBelow.has(child.span.id),
            )
        ) {
            failedBelow.add(node.span.id)
        }
    }

    let origin: SpanNode | undefined

    for (const node of tree.nodes) {
        if (
            node.span.status === 'failed' &&
            !failedBelow.has(node.span.id) &&
            (origin === undefined || node.span.sequence < origin.span.sequence)
        ) {
            origin = node
        }
    }

    return origin
}

/**
 * The id of the span to show. The URL's span when the run has it. Otherwise, on a failed run, where
 * the failure started (see `whereItFailed`), so the cause is on screen without a click; otherwise
 * the first top-level span. A span id that is not in the run falls back to that, without a fuss.
 * `null` only for a run without spans.
 */
export function resolveSelection(
    tree: SpanTree,
    requested: string,
    runStatus: Status,
): string | null {
    if (requested !== '' && tree.byId.has(requested)) {
        return requested
    }

    if (runStatus === 'failed') {
        const origin = whereItFailed(tree)

        if (origin) {
            return origin.span.id
        }
    }

    return tree.roots[0]?.span.id ?? null
}
