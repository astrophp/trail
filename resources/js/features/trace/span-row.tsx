import { ChevronRightIcon } from 'lucide-react'
import { memo, useMemo, type KeyboardEvent } from 'react'
import type { AgentSubtotal } from '@/api/types'
import { AttemptLabel } from '@/components/telemetry/attempt-label'
import { CostValue } from '@/components/telemetry/cost-value'
import { DurationValue } from '@/components/telemetry/duration-value'
import { SpanTypeIcon } from '@/components/telemetry/span-type-icon'
import { StatusBadge, statusLabel } from '@/components/telemetry/status-badge'
import { TokenValue } from '@/components/telemetry/token-value'
import type { SpanNode } from '@/features/trace/build-span-tree'
import { spanBilling } from '@/features/trace/span-billing'
import { spanSubtitle, spanTitle } from '@/features/trace/span-title'
import { cn } from '@/lib/utils'

/** Rows deeper than this are indented no further, so a deep chain keeps room for its name. */
const maxIndentLevels = 8

/** What an agent's tokens and cost cover: its own steps, not the agents it delegated to. */
const ownTitle = "This agent's own steps, without delegated agents"

/**
 * The width of the right-hand column of a row, which its column label shares. Room is kept in it
 * for what a row will show beside its figures.
 */
export const rightColumn = 'w-2/5 shrink-0'

/** The marker on the disclosure chevron, so a click on it can be told from a click on the row. */
const toggleSlot = 'span-row-toggle'

type SpanRowProps = {
    node: SpanNode
    /** The element id of the row, so the tree can move focus to it. */
    domId: string
    selected: boolean
    /** Whether this is the one row in the tab order. */
    tabbable: boolean
    /** `undefined` for a row without children. */
    expanded: boolean | undefined
    /** How many attempts the run made. */
    attempts: number
    /** The server's subtotal for this span, on an agent row. */
    subtotal: AgentSubtotal | undefined
    /** The row was clicked: `toggle` when the click landed on the chevron. */
    onPress: (id: string, toggle: boolean) => void
    onKeyDown: (event: KeyboardEvent<HTMLElement>, id: string) => void
}

/**
 * One row of the execution tree. Memoised on plain values and stable callbacks, so a change of
 * selection or of expansion re-renders only the rows it touches.
 */
export const SpanRow = memo(function SpanRow({
    node,
    domId,
    selected,
    tabbable,
    expanded,
    attempts,
    subtotal,
    onPress,
    onKeyDown,
}: SpanRowProps) {
    const { span } = node
    const subtitle = spanSubtitle(span, node.parentId !== null)
    const title = spanTitle(span)
    const billing = useMemo(() => spanBilling(span, subtotal), [span, subtotal])

    return (
        <div
            id={domId}
            data-slot="span-row"
            data-span-id={span.id}
            role="treeitem"
            // The status is part of the name, because a completed row shows no badge.
            aria-label={`${title}, ${statusLabel(span.status)}`}
            aria-describedby={`${domId}-line ${domId}-facts`}
            aria-level={node.depth + 1}
            aria-posinset={node.position}
            aria-setsize={node.setSize}
            aria-selected={selected}
            aria-expanded={expanded}
            tabIndex={tabbable ? 0 : -1}
            onClick={(event) =>
                onPress(
                    span.id,
                    (event.target as Element).closest(
                        `[data-slot="${toggleSlot}"]`,
                    ) !== null,
                )
            }
            onKeyDown={(event) => onKeyDown(event, span.id)}
            className="span-row flex min-h-12.5 items-center gap-3 rounded-md px-2 py-1.5 text-ui outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-selected:bg-primary-soft aria-selected:hover:bg-primary-soft"
        >
            <div
                className="flex min-w-0 flex-1 items-center gap-2"
                style={{
                    paddingInlineStart: `calc(var(--spacing) * ${Math.min(node.depth, maxIndentLevels) * 4})`,
                }}
            >
                <span
                    data-slot={toggleSlot}
                    aria-hidden="true"
                    className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground',
                        expanded !== undefined && 'hover:bg-muted',
                    )}
                >
                    {expanded === undefined ? null : (
                        <ChevronRightIcon
                            className={cn(
                                'size-3 transition-transform',
                                expanded && 'rotate-90',
                            )}
                        />
                    )}
                </span>
                <SpanTypeIcon type={span.type} decorative />
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">{title}</span>
                    <span
                        id={`${domId}-line`}
                        className={cn(
                            'truncate text-caption text-muted-foreground',
                            subtitle.mono && 'font-mono',
                        )}
                    >
                        {subtitle.text}
                    </span>
                </div>
            </div>
            <div
                id={`${domId}-facts`}
                className={cn(
                    rightColumn,
                    'flex flex-col items-end gap-0.5 text-caption text-muted-foreground',
                )}
            >
                <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
                    <AttemptLabel attempt={span.attempt} of={attempts} />
                    {span.status === 'completed' ? null : (
                        <StatusBadge status={span.status} />
                    )}
                    <DurationValue of={span} className="text-foreground" />
                </div>
                {billing ? (
                    <span
                        title={span.type === 'agent' ? ownTitle : undefined}
                        className="flex items-center gap-2"
                    >
                        {span.type === 'agent' ? (
                            <span className="sr-only">Own tokens</span>
                        ) : null}
                        <TokenValue usage={billing.usage} />
                        {span.type === 'agent' ? (
                            <span className="sr-only">Own cost</span>
                        ) : null}
                        <CostValue cost={billing.cost} />
                    </span>
                ) : null}
            </div>
        </div>
    )
})
