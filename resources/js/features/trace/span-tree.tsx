import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    type KeyboardEvent,
    type ReactNode,
} from 'react'
import type { AgentSubtotal } from '@/api/types'
import type {
    RowNode,
    SpanTree as Tree,
} from '@/features/trace/build-span-tree'
import { AttemptRow } from '@/features/trace/attempt-row'
import { isProblem } from '@/features/trace/filter-tree'
import { SpanRow } from '@/features/trace/span-row'
import type { TreeView } from '@/features/trace/use-tree-view'
import { cn } from '@/lib/utils'

type SpanTreeProps = {
    tree: Tree
    /** The rows on screen and the state behind them; see `useTreeView`. */
    view: TreeView
    /** The selected span; it does not have to be on screen (a collapsed parent may hide it). */
    selectedId: string | null
    onSelect: (id: string) => void
    /** The server's subtotal for each agent span, by span id. */
    agents: ReadonlyMap<string, AgentSubtotal>
    /** The length of the time axis the rows draw their bars on. */
    axisMs: number | null
    /** Shown instead of the tree while a search or filter leaves no row. */
    empty?: ReactNode
    /** The id of the element that describes the keys of the tree. */
    describedBy?: string
    className?: string
}

/** What the handlers read, so that they can keep one identity while the state changes. */
type Latest = Pick<SpanTreeProps, 'tree' | 'onSelect'> & {
    view: TreeView
    positions: ReadonlyMap<string, number>
}

/** Whether a row is open: `undefined` for a row with nothing under it on screen. */
function openState(row: RowNode, view: TreeView): boolean | undefined {
    const { keep, collapsed } = view

    if (keep !== null) {
        return row.nested.some((below) => keep.has(below.id)) ? true : undefined
    }

    return row.nested.length > 0 ? !collapsed.has(row.id) : undefined
}

/** The next span with a problem after row `at` in the given direction, wrapping round to the row itself last. */
function problemFrom(rows: RowNode[], at: number, step: 1 | -1) {
    for (let i = 1; i <= rows.length; i++) {
        const row = rows[(at + step * i + rows.length * i) % rows.length]

        if (row.kind === 'span' && isProblem(row.span)) {
            return row
        }
    }

    return undefined
}

/**
 * The execution tree of a run: every span under the one that started it, and under an agent that
 * failed over, one row per attempt. It is a tree for assistive technology (levels, set sizes,
 * expanded state) and for the keyboard: the arrows move focus, Right and Left open, close and walk
 * the levels, Home and End jump, Enter or Space select (or open an attempt), `e` and Shift+E jump to
 * the next and previous problem, and `*` opens the siblings of a row. Focus and selection are
 * separate: moving focus selects nothing.
 */
export function SpanTree({
    tree,
    view,
    selectedId,
    onSelect,
    agents,
    axisMs,
    empty,
    describedBy,
    className,
}: SpanTreeProps) {
    const treeId = useId()
    const { rows, filtering, setCollapsed } = view
    const positions = useMemo(
        () => new Map(rows.map((row, index) => [row.id, index])),
        [rows],
    )
    // Places among the rows that are shown under each parent, not among those the run has.
    const places = useMemo(() => {
        const sizes = new Map<string | null, number>()

        for (const row of rows) {
            sizes.set(row.rowParentId, (sizes.get(row.rowParentId) ?? 0) + 1)
        }

        const seen = new Map<string | null, number>()

        return new Map(
            rows.map((row) => {
                const position = (seen.get(row.rowParentId) ?? 0) + 1

                seen.set(row.rowParentId, position)

                return [
                    row.id,
                    [position, sizes.get(row.rowParentId) ?? 1] as const,
                ] as const
            }),
        )
    }, [rows])
    // The selected row; when a collapse or a filter hides it, the nearest row above it that is shown.
    const tabbableId =
        [
            selectedId,
            ...(selectedId === null
                ? []
                : tree.rowAncestors(selectedId).reverse()),
        ].find((id) => id !== null && positions.has(id)) ??
        rows[0]?.id ??
        null

    const latest = useRef<Latest>({ tree, onSelect, view, positions })

    useEffect(() => {
        latest.current = { tree, onSelect, view, positions }
    })

    const domId = useCallback((id: string) => `${treeId}-${id}`, [treeId])

    // A row to focus once it is on screen: `e` can jump to a problem a collapsed row was hiding.
    const pendingFocus = useRef<string | null>(null)

    useEffect(() => {
        if (pendingFocus.current !== null) {
            const target = document.getElementById(domId(pendingFocus.current))

            if (target) {
                pendingFocus.current = null
                target.focus()
            }
        }
    })

    // Taking a search or a filter off brings the selected row back into view; focus stays where it is.
    const wasFiltering = useRef(filtering)

    useEffect(() => {
        if (wasFiltering.current && !filtering && selectedId !== null) {
            document
                .getElementById(domId(selectedId))
                ?.scrollIntoView({ block: 'nearest' })
        }

        wasFiltering.current = filtering
    }, [filtering, selectedId, domId])

    const setOpen = useCallback(
        (id: string, open: boolean) => {
            // While a search or filter is on, expansion is not adjustable.
            if (latest.current.view.filtering) {
                return
            }

            setCollapsed((current) => {
                if (current.has(id) !== open) {
                    return current
                }

                const next = new Set(current)

                if (open) {
                    next.delete(id)
                } else {
                    next.add(id)
                }

                return next
            })
        },
        [setCollapsed],
    )

    const focusRow = useCallback(
        (id: string | undefined) => {
            if (id !== undefined) {
                document.getElementById(domId(id))?.focus()
            }
        },
        [domId],
    )

    const onPress = useCallback(
        (id: string, toggle: boolean) => {
            if (toggle) {
                setOpen(id, latest.current.view.collapsed.has(id))
            } else {
                latest.current.onSelect(id)
            }
        },
        [setOpen],
    )

    const onKeyDown = useCallback(
        (event: KeyboardEvent<HTMLElement>, id: string) => {
            const { positions, tree, onSelect, view } = latest.current
            const { rows } = view
            const at = positions.get(id)
            const row = tree.rowById.get(id)

            if (
                at === undefined ||
                row === undefined ||
                event.target !== event.currentTarget ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey
            ) {
                return
            }

            const open = openState(row, view)
            const { filtering } = view

            // `e` is the same key with Caps Lock on; Shift decides the direction.
            switch (event.key === 'E' ? 'e' : event.key) {
                case 'ArrowDown':
                    focusRow(rows[at + 1]?.id)
                    break
                case 'ArrowUp':
                    focusRow(rows[at - 1]?.id)
                    break
                case 'Home':
                    focusRow(rows[0]?.id)
                    break
                case 'End':
                    focusRow(rows.at(-1)?.id)
                    break
                case 'ArrowRight':
                    if (open === true) {
                        focusRow(rows[at + 1]?.id)
                    } else if (open === false) {
                        setOpen(id, true)
                    }
                    break
                case 'ArrowLeft':
                    if (open === true && !filtering) {
                        setOpen(id, false)
                    } else if (row.rowParentId !== null) {
                        focusRow(row.rowParentId)
                    }
                    break
                case 'Enter':
                case ' ':
                    if (row.kind === 'span') {
                        onSelect(id)
                    } else {
                        setOpen(id, view.collapsed.has(id))
                    }
                    break
                case 'e': {
                    // Across every problem in tree order, also those a collapsed row hides; while a
                    // search or filter is on, only the rows it shows.
                    const list = filtering ? rows : tree.rows
                    const target = problemFrom(
                        list,
                        list.indexOf(row),
                        event.shiftKey ? -1 : 1,
                    )

                    if (target === undefined) {
                        return
                    }

                    if (!positions.has(target.id)) {
                        const hiding = new Set(tree.rowAncestors(target.id))

                        setCollapsed((current) =>
                            [...current].some((hidden) => hiding.has(hidden))
                                ? new Set(
                                      [...current].filter(
                                          (hidden) => !hiding.has(hidden),
                                      ),
                                  )
                                : current,
                        )
                    }

                    pendingFocus.current = target.id
                    onSelect(target.id)
                    // Focus now when the row is on screen; otherwise after the next render.
                    focusRow(target.id)
                    break
                }
                case '*': {
                    if (filtering) {
                        break
                    }

                    const siblings =
                        row.rowParentId === null
                            ? tree.roots
                            : (tree.rowById.get(row.rowParentId)?.nested ?? [])

                    setCollapsed((current) => {
                        const next = new Set(current)

                        siblings.forEach((sibling) => next.delete(sibling.id))

                        return next.size === current.size ? current : next
                    })
                    break
                }
                default:
                    return
            }

            event.preventDefault()
        },
        [focusRow, setOpen, setCollapsed],
    )

    if (filtering && rows.length === 0) {
        return empty
    }

    return (
        <div
            role="tree"
            aria-label="Execution tree"
            aria-describedby={describedBy}
            data-slot="span-tree"
            className={cn('flex flex-col gap-0.5 p-2', className)}
        >
            {rows.map((row) =>
                row.kind === 'attempt' ? (
                    <AttemptRow
                        key={row.id}
                        node={row}
                        domId={domId(row.id)}
                        tabbable={row.id === tabbableId}
                        expanded={openState(row, view)}
                        position={places.get(row.id)?.[0] ?? 1}
                        setSize={places.get(row.id)?.[1] ?? 1}
                        filtering={filtering}
                        onPress={onPress}
                        onKeyDown={onKeyDown}
                        onSelect={onSelect}
                    />
                ) : (
                    <SpanRow
                        key={row.id}
                        node={row}
                        domId={domId(row.id)}
                        selected={row.id === selectedId}
                        tabbable={row.id === tabbableId}
                        expanded={openState(row, view)}
                        position={places.get(row.id)?.[0] ?? 1}
                        setSize={places.get(row.id)?.[1] ?? 1}
                        filtering={filtering}
                        attempts={tree.attempts}
                        axisMs={axisMs}
                        subtotal={agents.get(row.id)}
                        onPress={onPress}
                        onKeyDown={onKeyDown}
                    />
                ),
            )}
        </div>
    )
}
