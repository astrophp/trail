import {
    useCallback,
    useMemo,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react'
import type { SpanTree } from '@/features/trace/build-span-tree'
import { filterTree, isFiltering } from '@/features/trace/filter-tree'

export type TreeView = {
    /** The rows on screen. */
    rows: ReturnType<SpanTree['visible']>
    collapsed: ReadonlySet<string>
    setCollapsed: Dispatch<SetStateAction<ReadonlySet<string>>>
    query: string
    setQuery: (query: string) => void
    problemsOnly: boolean
    setProblemsOnly: (on: boolean) => void
    /** Whether a search or a filter is narrowing the tree. */
    filtering: boolean
    /** The rows a search or filter keeps; `null` when none is on. */
    keep: ReadonlySet<string> | null
    /** Whether any row with something under it is open. */
    anyOpen: boolean
    /** Whether the tree has a row with something under it at all. */
    hasParents: boolean
    /** Collapses every row when any is open, and opens every row otherwise. */
    toggleAll: () => void
    clear: () => void
}

/**
 * The view state of an execution tree: which rows are collapsed, and the search and filter that
 * narrow it. Everything starts expanded and unfiltered; a new run needs a new component (`key`).
 * A span selected from outside (a link with `?span=`, a reload) is shown: what hides it opens.
 */
export function useTreeView(
    tree: SpanTree,
    selectedId: string | null,
): TreeView {
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
        () => new Set(),
    )
    const [query, setQuery] = useState('')
    const [problemsOnly, setProblemsOnly] = useState(false)
    const [seen, setSeen] = useState(selectedId)
    const filtering = isFiltering({ query, problemsOnly })

    // Selecting in the tree writes the URL with `replace`, so Back does not come here. While a
    // search or filter is on, expansion is not adjustable and nothing is written to it: the span
    // is revealed when the filter clears.
    if (seen !== selectedId && !filtering) {
        setSeen(selectedId)

        if (selectedId !== null) {
            const hiding = tree
                .rowAncestors(selectedId)
                .filter((id) => collapsed.has(id))

            if (hiding.length > 0) {
                setCollapsed(
                    new Set(
                        [...collapsed].filter((id) => !hiding.includes(id)),
                    ),
                )
            }
        }
    }

    const keep = useMemo(
        () => filterTree(tree, { query, problemsOnly }),
        [tree, query, problemsOnly],
    )
    const rows = useMemo(
        () => tree.visible(collapsed, keep),
        [tree, collapsed, keep],
    )
    const anyOpen = useMemo(
        () =>
            tree.rows.some(
                (row) => row.nested.length > 0 && !collapsed.has(row.id),
            ),
        [tree, collapsed],
    )
    const hasParents = useMemo(
        () => tree.rows.some((row) => row.nested.length > 0),
        [tree],
    )
    const toggleAll = useCallback(() => {
        if (filtering || !hasParents) {
            return
        }

        setCollapsed(
            anyOpen
                ? new Set(
                      tree.rows
                          .filter((row) => row.nested.length > 0)
                          .map((row) => row.id),
                  )
                : new Set(),
        )
    }, [tree, anyOpen, filtering, hasParents])
    const clear = useCallback(() => {
        setQuery('')
        setProblemsOnly(false)
    }, [])

    return {
        rows,
        collapsed,
        setCollapsed,
        query,
        setQuery,
        problemsOnly,
        setProblemsOnly,
        filtering,
        keep,
        anyOpen,
        hasParents,
        toggleAll,
        clear,
    }
}
