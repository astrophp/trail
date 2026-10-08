import { memo, useMemo, type KeyboardEvent } from 'react'
import type { AgentSubtotal } from '@/api/types'
import { AttemptLabel } from '@/components/telemetry/attempt-label'
import { CostValue } from '@/components/telemetry/cost-value'
import { DurationValue } from '@/components/telemetry/duration-value'
import { SpanTypeIcon } from '@/components/telemetry/span-type-icon'
import { StatusBadge, statusLabel } from '@/components/telemetry/status-badge'
import { TimingBar } from '@/components/telemetry/timing-bar'
import { TokenValue } from '@/components/telemetry/token-value'
import { rowIndent, toggleSlot } from '@/features/trace/row-layout'
import { RowToggle } from '@/features/trace/row-toggle'
import type { SpanNode } from '@/features/trace/build-span-tree'
import { spanBilling } from '@/features/trace/span-billing'
import { spanSubtitle, spanTitle } from '@/features/trace/span-title'
import { cn } from '@/lib/utils'

/** What an agent's tokens and cost cover: its own steps, not the agents it delegated to. */
const ownTitle = "This agent's own steps, without delegated agents"

/**
 * The width of the right-hand column of a row, which its column label shares: the timing lane and
 * the duration. Below `md` the tree is alone on screen and the column is the duration only.
 */
export const rightColumn = 'shrink-0 md:w-1/2'

/** The width of the duration at the end of the right column, and of its column label. */
export const durationWidth = 'w-20 shrink-0 text-end'

type SpanRowProps = {
    node: SpanNode
    /** The element id of the row, so the tree can move focus to it. */
    domId: string
    selected: boolean
    /** Whether this is the one row in the tab order. */
    tabbable: boolean
    /** `undefined` for a row without children on screen. */
    expanded: boolean | undefined
    /** Its place among the rows shown under the same parent, and how many are shown. */
    position: number
    setSize: number
    /** A search or filter is on: the row shows no chevron, because expansion is not adjustable. */
    filtering: boolean
    /** How many attempts the run made. */
    attempts: number
    /** The length of the time axis the bar is drawn on; `null` when no span has captured timing. */
    axisMs: number | null
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
    position,
    setSize,
    filtering,
    attempts,
    axisMs,
    subtotal,
    onPress,
    onKeyDown,
}: SpanRowProps) {
    const { span } = node
    const subtitle = spanSubtitle(span, node.parentId !== null)
    const title = spanTitle(span)
    const billing = useMemo(() => spanBilling(span, subtotal), [span, subtotal])
    // The attempt rows already say which attempt it is, for the spans under them and the agent over them.
    const showAttempt = !node.inAttempt && node.nested[0]?.kind !== 'attempt'

    return (
        <div
            id={domId}
            data-slot="span-row"
            data-span-id={span.id}
            role="treeitem"
            // The status is part of the name, because a completed row shows no badge.
            aria-label={`${title}, ${statusLabel(span.status)}`}
            aria-describedby={`${domId}-line ${domId}-bar ${domId}-facts`}
            aria-level={node.depth + 1}
            aria-posinset={position}
            aria-setsize={setSize}
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
                style={rowIndent(node.depth)}
            >
                <RowToggle expanded={filtering ? undefined : expanded} />
                <SpanTypeIcon type={span.type} decorative />
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{title}</span>
                        {span.status === 'completed' ? null : (
                            <StatusBadge status={span.status} />
                        )}
                        {showAttempt ? (
                            <AttemptLabel
                                attempt={span.attempt}
                                of={attempts}
                            />
                        ) : null}
                    </span>
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
                    'flex flex-col gap-0.5 text-caption text-muted-foreground',
                )}
            >
                <div className="flex items-center gap-2">
                    {/* Hidden from the tree itself: the row's description reads the bar by its id. */}
                    <div
                        aria-hidden="true"
                        className="hidden min-w-0 flex-1 md:block"
                    >
                        <TimingBar
                            id={`${domId}-bar`}
                            span={span}
                            axisMs={axisMs}
                        />
                    </div>
                    <DurationValue
                        of={span}
                        className={cn(durationWidth, 'text-foreground')}
                    />
                </div>
                {billing ? (
                    <span
                        title={span.type === 'agent' ? ownTitle : undefined}
                        className="flex items-center justify-end gap-2"
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
