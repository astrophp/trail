import type { Span } from '@/api/types'
import type { SpanTree } from '@/features/trace/build-span-tree'

/** The agent a tool span started: the first child of type agent, in recorded order. */
export function childAgent(tree: SpanTree, span: Span): Span | undefined {
    return tree.byId
        .get(span.id)
        ?.children.find((child) => child.span.type === 'agent')?.span
}
