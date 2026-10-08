import type { Span } from '@/api/types'

/**
 * One span in the tree: its children in `sequence` order, and where it stands among its siblings.
 * `children` are always the span's own children. `nested` is what hangs under its row: the same
 * spans, or the attempt rows between an agent and its children after a failover.
 */
export type SpanNode = {
    kind: 'span'
    /** The span's id, so that a span and an attempt row can be told apart by one field. */
    id: string
    span: Span
    children: SpanNode[]
    nested: RowNode[]
    /** 0 for a top-level span; an attempt row counts as a level, so the spans under it are one deeper. */
    depth: number
    /** The id of the span this one hangs under; `null` at the top level. Never an attempt row. */
    parentId: string | null
    /** The id of the row this one hangs under: `parentId`, or the attempt row it is grouped in. */
    rowParentId: string | null
    /** Its place among its siblings, counted from 1, and how many siblings there are. */
    position: number
    setSize: number
    /** Whether the span is under an attempt row, at any depth. */
    inAttempt: boolean
}

/** How an attempt ended: it failed, or it produced the answer of the run. `null` when neither is known. */
export type AttemptOutcome = 'failed' | 'answered' | null

/**
 * The row for one failover attempt of an agent. It is not a span: it has no evidence and cannot be
 * selected, and `SpanTree.byId` does not know it. Its id is `attempt:{agent span id}:{attempt}`.
 */
export type AttemptNode = {
    kind: 'attempt'
    id: string
    agentId: string
    /** The stored attempt number of the spans it holds. */
    attempt: number
    /** The highest attempt among the agent's children. */
    of: number
    outcome: AttemptOutcome
    /** The first failed child of the attempt, when it has one. */
    failed: Span | null
    nested: SpanNode[]
    depth: number
    parentId: string
    rowParentId: string
    position: number
    setSize: number
}

export type RowNode = SpanNode | AttemptNode

export type SpanTree = {
    /** The top-level spans, in `sequence` order. */
    roots: SpanNode[]
    /** Every span node in tree order (each span before its children). */
    nodes: SpanNode[]
    /** Every row in tree order: the span nodes and the attempt rows between them. */
    rows: RowNode[]
    byId: ReadonlyMap<string, SpanNode>
    /** Every row, spans and attempt rows, by id. */
    rowById: ReadonlyMap<string, RowNode>
    /** The highest `attempt` among the spans: how many attempts the run made. */
    attempts: number
    /**
     * The rows on screen, in tree order. The rows in `collapsed` hide what is under them. With
     * `keep`, only the rows in it are shown and nothing is collapsed: what a search leaves open.
     */
    visible(
        collapsed: ReadonlySet<string>,
        keep?: ReadonlySet<string> | null,
    ): RowNode[]
    /** The ids of the spans above a span, the top-level one first; empty for a top-level span or an unknown id. */
    ancestors(id: string): string[]
    /** The ids of the rows above a row, attempt rows included, the top-level one first. */
    rowAncestors(id: string): string[]
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
        const children: SpanNode[] = []

        nodeOf.set(span.id, {
            kind: 'span',
            id: span.id,
            span,
            children,
            nested: children,
            depth: 0,
            parentId: null,
            rowParentId: null,
            position: 1,
            setSize: 1,
            inAttempt: false,
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
                childNode.rowParentId = node.span.id
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

    groupAttempts(roots)

    const rows: RowNode[] = []
    const rowById = new Map<string, RowNode>(nodeOf)
    const walk = [...roots].reverse() as RowNode[]

    for (let row = walk.pop(); row; row = walk.pop()) {
        rows.push(row)
        rowById.set(row.id, row)

        for (let i = row.nested.length - 1; i >= 0; i--) {
            walk.push(row.nested[i])
        }
    }

    const nodes = rows.filter((row) => row.kind === 'span')

    return {
        roots,
        nodes,
        rows,
        byId: nodeOf,
        rowById,
        attempts: sorted.reduce(
            (most, span) => Math.max(most, span.attempt),
            0,
        ),
        visible(collapsed, keep = null) {
            const shown: RowNode[] = []
            // While inside a collapsed row, the depth it sits at; rows deeper than that are hidden.
            let hiddenBelow = Infinity

            for (const row of rows) {
                if (keep !== null) {
                    if (keep.has(row.id)) {
                        shown.push(row)
                    }

                    continue
                }

                if (row.depth > hiddenBelow) {
                    continue
                }

                hiddenBelow =
                    collapsed.has(row.id) && row.nested.length > 0
                        ? row.depth
                        : Infinity
                shown.push(row)
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
        rowAncestors(id) {
            const above: string[] = []

            for (
                let parent = rowById.get(id)?.rowParentId ?? null;
                parent !== null;
                parent = rowById.get(parent)?.rowParentId ?? null
            ) {
                above.unshift(parent)
            }

            return above
        },
    }
}

/** Moves a whole subtree one level down and marks it as being inside an attempt. */
function sink(children: SpanNode[]) {
    const stack = [...children]

    for (let node = stack.pop(); node; node = stack.pop()) {
        node.depth += 1
        node.inAttempt = true
        stack.push(...node.children)
    }
}

/**
 * Puts the children of every agent span whose children carry more than one distinct `attempt`
 * under one attempt row per attempt, in order. An agent with one attempt is left alone. Each
 * agent is judged on its own children, so a delegated agent with its own failover groups its own.
 */
function groupAttempts(roots: SpanNode[]) {
    const stack = [...roots]

    for (let node = stack.pop(); node; node = stack.pop()) {
        stack.push(...node.children)

        const numbers = [
            ...new Set(node.children.map((child) => child.span.attempt)),
        ].sort((a, b) => a - b)

        if (node.span.type !== 'agent' || numbers.length < 2) {
            continue
        }

        const last = numbers[numbers.length - 1]
        const groups = numbers.map((attempt, index): AttemptNode => {
            const held = node.children.filter(
                (child) => child.span.attempt === attempt,
            )
            const failed =
                held.find((child) => child.span.status === 'failed')?.span ??
                null
            let outcome: AttemptOutcome = null

            if (attempt === last) {
                outcome =
                    node.span.status === 'completed'
                        ? 'answered'
                        : node.span.status === 'failed'
                          ? 'failed'
                          : null
            } else if (failed !== null) {
                outcome = 'failed'
            }

            held.forEach((child, position) => {
                child.rowParentId = `attempt:${node.id}:${attempt}`
                child.position = position + 1
                child.setSize = held.length
            })
            sink(held)

            return {
                kind: 'attempt',
                id: `attempt:${node.id}:${attempt}`,
                agentId: node.id,
                attempt,
                of: last,
                outcome,
                failed,
                nested: held,
                depth: node.depth + 1,
                parentId: node.id,
                rowParentId: node.id,
                position: index + 1,
                setSize: numbers.length,
            }
        })

        node.nested = groups
    }
}
