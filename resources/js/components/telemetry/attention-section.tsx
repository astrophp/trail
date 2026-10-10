import type { ReactNode } from 'react'
import type { TracesLinkerFor } from '@/api/traces-link'
import type { AttentionItem } from '@/api/types'
import { CountChip } from '@/components/patterns/count-chip'
import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelEmpty } from '@/components/patterns/panel-empty'
import { PanelError } from '@/components/patterns/panel-error'
import { PanelHeader } from '@/components/patterns/panel-header'
import { PanelLoading } from '@/components/patterns/panel-loading'
import { AttentionCells } from '@/components/telemetry/attention-cells'
import type { TimeRangePreset } from '@/lib/time-range'
import { cn } from '@/lib/utils'

type AttentionSectionProps = {
    /** What needs a look, most pressing first; `undefined` while there is no answer to draw. */
    items: AttentionItem[] | undefined
    /** The range the items were counted over, which every link follows. */
    range: TimeRangePreset
    linkFor: TracesLinkerFor
    /** The items are the previous view's: they are drawn dimmed, and not counted. */
    busy?: boolean
    /** The list could not be loaded and there is nothing to show instead. */
    failure?: { message: string; onRetry: () => void }
    /** Above the list: whether what is shown could not be brought up to date. */
    note?: ReactNode
    className?: string
}

/**
 * What in a range needs a look, as a panel: a title with the number of items, and the cells, each
 * a link to the runs behind it. It draws what it is given. An empty list is an answer ("nothing
 * needs attention"), but an empty list that is the previous view's is not, and shows the loading
 * state instead.
 */
export function AttentionSection({
    items,
    range,
    linkFor,
    busy = false,
    failure,
    note,
    className,
}: AttentionSectionProps) {
    // The count in the header is the current answer's, never the previous view's.
    const count =
        !busy && items !== undefined && items.length > 0
            ? items.length
            : undefined

    const body = () => {
        if (failure !== undefined) {
            return (
                <PanelError
                    title="What needs attention could not be loaded"
                    message={failure.message}
                    onRetry={failure.onRetry}
                />
            )
        }

        // An empty placeholder is the previous view's "nothing": it says nothing about this one.
        if (items === undefined || (busy && items.length === 0)) {
            return <PanelLoading rows={4} />
        }

        return (
            <>
                {note}
                <div
                    aria-busy={busy || undefined}
                    className={cn(
                        'motion-safe:transition-opacity',
                        busy && 'opacity-60',
                    )}
                >
                    {items.length === 0 ? (
                        <PanelEmpty title="Nothing needs attention in this range" />
                    ) : (
                        <AttentionCells
                            items={items}
                            range={range}
                            linkFor={linkFor}
                        />
                    )}
                </div>
            </>
        )
    }

    return (
        <Panel className={className}>
            {/* Always mounted, so a change of its text is announced; outside the busy part, where it may be muted. */}
            <span role="status" className="sr-only">
                {busy && failure === undefined
                    ? 'Loading what needs attention'
                    : ''}
            </span>
            <PanelHeader
                title="Needs attention"
                action={
                    count === undefined ? null : (
                        <span className="inline-flex items-center gap-1">
                            <CountChip count={count} />
                            <span className="sr-only">
                                {count === 1 ? 'item' : 'items'}
                            </span>
                        </span>
                    )
                }
            />
            <PanelContent className="@container">{body()}</PanelContent>
        </Panel>
    )
}
