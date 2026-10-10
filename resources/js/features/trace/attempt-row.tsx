import { CircleCheckIcon, CircleXIcon, RotateCwIcon } from 'lucide-react'
import { memo, type KeyboardEvent } from 'react'
import { IssueLabel } from '@/components/telemetry/issue-label'
import { Button } from '@/components/ui/button'
import type { AttemptNode } from '@/features/trace/build-span-tree'
import { rowIndent } from '@/features/trace/row-layout'
import { RowToggle } from '@/features/trace/row-toggle'
import { spanTitle } from '@/features/trace/span-title'

type AttemptRowProps = {
    node: AttemptNode
    /** The element id of the row, so the tree can move focus to it. */
    domId: string
    /** Whether this is the one row in the tab order. */
    tabbable: boolean
    expanded: boolean | undefined
    /** Its place among the rows shown under the same agent, and how many are shown. */
    position: number
    setSize: number
    /** A search or filter is on: no chevron, because expansion is not adjustable. */
    filtering: boolean
    /** A click on the row: it only opens and closes it. */
    onPress: (id: string, toggle: boolean) => void
    onKeyDown: (event: KeyboardEvent<HTMLElement>, id: string) => void
    /** Selects a span: the one that failed in this attempt. */
    onSelect: (id: string) => void
}

/**
 * The row for one failover attempt of an agent. It is not a span: it cannot be selected and has no
 * evidence, it opens and closes what it holds. It says how the attempt ended, in words and an
 * icon, and for a failed attempt shows the failure and a button to the span that failed.
 */
export const AttemptRow = memo(function AttemptRow({
    node,
    domId,
    tabbable,
    expanded,
    position,
    setSize,
    filtering,
    onPress,
    onKeyDown,
    onSelect,
}: AttemptRowProps) {
    const { failed, outcome } = node
    const message = failed?.error?.message ?? null
    const name = `Attempt ${node.attempt} of ${node.of}`

    return (
        <div
            id={domId}
            data-slot="attempt-row"
            // An attempt is not a span and cannot be selected, so unlike a span's row it has no
            // `aria-selected`, which the rule asks of every treeitem.
            // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
            role="treeitem"
            aria-label={name}
            aria-describedby={`${domId}-outcome`}
            aria-level={node.depth + 1}
            aria-posinset={position}
            aria-setsize={setSize}
            aria-expanded={expanded}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onPress(node.id, true)}
            onKeyDown={(event) => onKeyDown(event, node.id)}
            className="span-row flex min-h-12.5 items-center gap-3 rounded-md px-2 py-1.5 text-ui outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
            <div
                className="flex min-w-0 flex-1 items-center gap-2"
                style={rowIndent(node.depth)}
            >
                <RowToggle expanded={filtering ? undefined : expanded} />
                <RotateCwIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">
                        Attempt {node.attempt}
                    </span>
                    <span
                        id={`${domId}-outcome`}
                        className="flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground"
                    >
                        {outcome === 'answered' ? (
                            <>
                                <CircleCheckIcon
                                    aria-hidden="true"
                                    className="size-3 shrink-0 text-success"
                                />
                                <span className="text-success">Answered</span>
                            </>
                        ) : null}
                        {outcome === 'failed' ? (
                            <>
                                <CircleXIcon
                                    aria-hidden="true"
                                    className="size-3 shrink-0 text-destructive"
                                />
                                <span className="shrink-0 text-destructive">
                                    Failed
                                </span>
                                {failed?.issue_kind ? (
                                    <>
                                        {' '}
                                        <IssueLabel
                                            kind={failed.issue_kind}
                                            className="shrink-0"
                                        />
                                    </>
                                ) : null}
                                {message === null ? null : (
                                    <>
                                        {' '}
                                        <span
                                            title={message}
                                            className="truncate"
                                        >
                                            {message}
                                        </span>
                                    </>
                                )}
                            </>
                        ) : null}
                    </span>
                </div>
            </div>
            {outcome === 'failed' && failed !== null ? (
                <Button
                    variant="ghost"
                    size="xs"
                    // Not a second tab stop in the tree: the keyboard reaches the span with the arrows or `e`.
                    tabIndex={-1}
                    aria-label={`Show failure of attempt ${node.attempt}: ${spanTitle(failed)}`}
                    onClick={(event) => {
                        event.stopPropagation()
                        onSelect(failed.id)
                    }}
                >
                    Show failure
                </Button>
            ) : null}
        </div>
    )
})
