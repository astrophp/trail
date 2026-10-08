import type { Span } from '@/api/types'
import type { SpanTree } from '@/features/trace/build-span-tree'
import { statusLabel } from '@/components/telemetry/status-badge'
import { spanSubtitle, spanTitle } from '@/features/trace/span-title'

/** What narrows the tree. Both are view state: they are never written to the URL. */
export type TreeFilter = {
    query: string
    problemsOnly: boolean
}

/** A span that failed or never finished. */
export function isProblem(span: Pick<Span, 'status'>): boolean {
    return span.status === 'failed' || span.status === 'incomplete'
}

export function isFiltering({ query, problemsOnly }: TreeFilter): boolean {
    return query.trim() !== '' || problemsOnly
}

/**
 * The ids of the rows to show for a filter: the spans that match, with every row above them
 * (their ancestors and attempt rows). `null` when nothing is being filtered. A search matches,
 * ignoring case, what the row shows: its title, its second line (the model, or what kind of call
 * it is) and its status word; "problems only" keeps failed and
 * incomplete spans; both together keep the spans that satisfy both.
 */
export function filterTree(
    tree: SpanTree,
    filter: TreeFilter,
): ReadonlySet<string> | null {
    if (!isFiltering(filter)) {
        return null
    }

    const query = filter.query.trim().toLowerCase()
    const keep = new Set<string>()

    for (const { span, id, parentId } of tree.nodes) {
        if (filter.problemsOnly && !isProblem(span)) {
            continue
        }

        if (
            query !== '' &&
            ![
                spanTitle(span),
                spanSubtitle(span, parentId !== null).text,
                statusLabel(span.status),
            ]
                .join('\n')
                .toLowerCase()
                .includes(query)
        ) {
            continue
        }

        keep.add(id)

        // Everything above a kept row is kept already, so the walk stops at the first one that is.
        for (
            let above = tree.rowById.get(id)?.rowParentId ?? null;
            above !== null && !keep.has(above);
            above = tree.rowById.get(above)?.rowParentId ?? null
        ) {
            keep.add(above)
        }
    }

    return keep
}
