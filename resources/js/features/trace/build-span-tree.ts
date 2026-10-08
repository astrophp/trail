import type { Span } from '@/api/types'

/** One span in the tree: its children in `sequence` order, and where it stands among its siblings. */
export type SpanNode = {
    span: Span
    children: SpanNode[]
    /** 0 for a top-level span. */
    depth: number
    /** The id of the span this one hangs under; `null` at the top level. */
    parentId: string | null
    /** Its place among its siblings, counted from 1, and how many siblings there are. */
    position: number
    setSize: number
}

export type SpanTree = {
    /** The top-level spans, in `sequence` order. */
    roots: SpanNode[]
    /** Every node in tree order (each span before its children). */
    nodes: SpanNode[]
    byId: ReadonlyMap<string, SpanNode>
    /** The highest `attempt` among the spans: how many attempts the run made. */
    attempts: number
    /** The nodes on screen when the spans in `collapsed` hide their children, in tree order. */
    visible(collapsed: ReadonlySet<string>): SpanNode[]
    /** The ids above a span, the top-level one first; empty for a top-level span or an unknown id. */
    ancestors(id: string): string[]
}

/**
 * Turns the flat spans of a run into a tree, in `sequence` order. A span whose parent is not among
 * the spans is shown at the top level instead of being dropped. A parent cycle is broken at its
 * earliest span, which becomes a top-level one, so every span is in the tree exactly once.
 * It does not recurse, so a very deep run cannot overflow the stack.
 */
export function buildSpanTree(spans: readonly Span[]): SpanTree {
    const sorted = [...spans].sort((a, b) => a.sequence - b.sequence)
    const ids = new Set(sorted.map((span) => span.id))
    const nodeOf = new Map<string, SpanNode>()
    const childSpans = new Map<string, Span[]>()
    const rootSpans: Span[] = []

    for (const span of sorted) {
        nodeOf.set(span.id, {
            span,
            children: [],
            depth: 0,
            parentId: null,
            position: 1,
            setSize: 1,
        })

        const parent = span.parent_id

        if (parent !== null && parent !== span.id && ids.has(parent)) {
            const siblings = childSpans.get(parent) ?? []

            siblings.push(span)
            childSpans.set(parent, siblings)
        } else {
            rootSpans.push(span)
        }
    }

    const placed = new Set<string>()
    const roots: SpanNode[] = []

    /** Places a top-level span and everything under it that is not placed yet. */
    const grow = (span: Span) => {
        const root = nodeOf.get(span.id) as SpanNode
        const stack = [root]

        roots.push(root)
        placed.add(span.id)

        for (let node = stack.pop(); node; node = stack.pop()) {
            const below = (childSpans.get(node.span.id) ?? []).filter(
                (child) => !placed.has(child.id),
            )

            below.forEach((child, index) => {
                const childNode = nodeOf.get(child.id) as SpanNode

                placed.add(child.id)
                childNode.depth = node.depth + 1
                childNode.parentId = node.span.id
                childNode.position = index + 1
                childNode.setSize = below.length
                node.children.push(childNode)
                stack.push(childNode)
            })
        }
    }

    rootSpans.forEach(grow)

    // Whatever is left hangs off a cycle: its earliest span starts over at the top.
    for (const span of sorted) {
        if (!placed.has(span.id)) {
            grow(span)
        }
    }

    roots.sort((a, b) => a.span.sequence - b.span.sequence)
    roots.forEach((root, index) => {
        root.position = index + 1
        root.setSize = roots.length
    })

    const nodes: SpanNode[] = []
    const walk = [...roots].reverse()

    for (let node = walk.pop(); node; node = walk.pop()) {
        nodes.push(node)

        for (let i = node.children.length - 1; i >= 0; i--) {
            walk.push(node.children[i])
        }
    }

    return {
        roots,
        nodes,
        byId: nodeOf,
        attempts: sorted.reduce(
            (most, span) => Math.max(most, span.attempt),
            0,
        ),
        visible(collapsed) {
            const shown: SpanNode[] = []
            // While inside a collapsed span, the depth it sits at; nodes deeper than that are hidden.
            let hiddenBelow = Infinity

            for (const node of nodes) {
                if (node.depth > hiddenBelow) {
                    continue
                }

                hiddenBelow =
                    collapsed.has(node.span.id) && node.children.length > 0
                        ? node.depth
                        : Infinity
                shown.push(node)
            }

            return shown
        },
        ancestors(id) {
            const above: string[] = []

            for (
                let parent = nodeOf.get(id)?.parentId ?? null;
                parent !== null;
                parent = nodeOf.get(parent)?.parentId ?? null
            ) {
                above.unshift(parent)
            }

            return above
        },
    }
}
