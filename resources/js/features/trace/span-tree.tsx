import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
} from 'react'
import type { AgentSubtotal } from '@/api/types'
import type { SpanTree as Tree } from '@/features/trace/build-span-tree'
import { SpanRow } from '@/features/trace/span-row'
import { cn } from '@/lib/utils'

type SpanTreeProps = {
    tree: Tree
    /** The selected span; it does not have to be on screen (a collapsed parent may hide it). */
    selectedId: string | null
    onSelect: (id: string) => void
    /** The server's subtotal for each agent span, by span id. */
    agents: ReadonlyMap<string, AgentSubtotal>
    className?: string
}

/** What the handlers read, so that they can keep one identity while the state changes. */
type Latest = Pick<SpanTreeProps, 'tree' | 'onSelect'> & {
    collapsed: ReadonlySet<string>
    visible: ReturnType<Tree['visible']>
    positions: ReadonlyMap<string, number>
}

/**
 * The execution tree of a run: every span under the one that started it. It is a tree for
 * assistive technology (levels, set sizes, expanded state) and for the keyboard: the arrows move
 * focus, Right and Left open, close and walk the levels, Home and End jump, and Enter or Space
 * select. Focus and selection are separate: moving focus selects nothing. Everything starts
 * expanded; expansion is this component's own state, and a new run needs a new component (`key`).
 */
export function SpanTree({
    tree,
    selectedId,
    onSelect,
    agents,
    className,
}: SpanTreeProps) {
    const treeId = useId()
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
        () => new Set(),
    )
    const [seen, setSeen] = useState(selectedId)

    // A span selected from outside (a link with `?span=`, a reload) is shown: what hides it opens.
    // Selecting in the tree writes the URL with `replace`, so Back does not come here.
    if (seen !== selectedId) {
        setSeen(selectedId)

        if (selectedId !== null) {
            const hiding = tree
                .ancestors(selectedId)
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

    const visible = useMemo(() => tree.visible(collapsed), [tree, collapsed])
    const positions = useMemo(
        () => new Map(visible.map((node, index) => [node.span.id, index])),
        [visible],
    )
    // The selected row; when a collapse hides it, the nearest row above it that is shown.
    const tabbableId =
        [
            selectedId,
            ...(selectedId === null
                ? []
                : tree.ancestors(selectedId).reverse()),
        ].find((id) => id !== null && positions.has(id)) ??
        visible[0]?.span.id ??
        null

    const latest = useRef<Latest>({
        tree,
        onSelect,
        collapsed,
        visible,
        positions,
    })

    useEffect(() => {
        latest.current = { tree, onSelect, collapsed, visible, positions }
    })

    const domId = useCallback((id: string) => `${treeId}-${id}`, [treeId])

    const setOpen = useCallback((id: string, open: boolean) => {
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
    }, [])

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
                setOpen(id, latest.current.collapsed.has(id))
            } else {
                latest.current.onSelect(id)
            }
        },
        [setOpen],
    )

    const onKeyDown = useCallback(
        (event: KeyboardEvent<HTMLElement>, id: string) => {
            const { visible, positions, collapsed, tree, onSelect } =
                latest.current
            const at = positions.get(id)
            const node = tree.byId.get(id)

            if (
                at === undefined ||
                node === undefined ||
                event.target !== event.currentTarget ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey
            ) {
                return
            }

            const open = node.children.length > 0 && !collapsed.has(id)

            switch (event.key) {
                case 'ArrowDown':
                    focusRow(visible[at + 1]?.span.id)
                    break
                case 'ArrowUp':
                    focusRow(visible[at - 1]?.span.id)
                    break
                case 'Home':
                    focusRow(visible[0]?.span.id)
                    break
                case 'End':
                    focusRow(visible.at(-1)?.span.id)
                    break
                case 'ArrowRight':
                    if (node.children.length > 0) {
                        if (open) {
                            focusRow(node.children[0].span.id)
                        } else {
                            setOpen(id, true)
                        }
                    }
                    break
                case 'ArrowLeft':
                    if (open) {
                        setOpen(id, false)
                    } else if (node.parentId !== null) {
                        focusRow(node.parentId)
                    }
                    break
                case 'Enter':
                case ' ':
                    onSelect(id)
                    break
                default:
                    return
            }

            event.preventDefault()
        },
        [focusRow, setOpen],
    )

    return (
        <div
            role="tree"
            aria-label="Execution tree"
            data-slot="span-tree"
            className={cn('flex flex-col gap-0.5 p-2', className)}
        >
            {visible.map((node) => {
                const id = node.span.id

                return (
                    <SpanRow
                        key={id}
                        node={node}
                        domId={domId(id)}
                        selected={id === selectedId}
                        tabbable={id === tabbableId}
                        expanded={
                            node.children.length > 0
                                ? !collapsed.has(id)
                                : undefined
                        }
                        attempts={tree.attempts}
                        subtotal={agents.get(id)}
                        onPress={onPress}
                        onKeyDown={onKeyDown}
                    />
                )
            })}
        </div>
    )
}
