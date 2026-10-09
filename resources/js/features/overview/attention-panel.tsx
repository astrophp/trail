import { failureMessage } from '@/api/client'
import { tracesLinkFor } from '@/api/traces-link'
import { CountChip } from '@/components/patterns/count-chip'
import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelEmpty } from '@/components/patterns/panel-empty'
import { PanelError } from '@/components/patterns/panel-error'
import { PanelHeader } from '@/components/patterns/panel-header'
import { PanelLoading } from '@/components/patterns/panel-loading'
import { AttentionCells } from '@/components/telemetry/attention-cells'
import { RefreshNote } from '@/components/patterns/refresh-note'
import { useAttention } from '@/features/overview/use-attention'
import { useQueryStatus } from '@/hooks/use-query-status'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { useTimeRange } from '@/hooks/use-time-range'
import { cn } from '@/lib/utils'

/**
 * What in the range needs a look, most pressing first, each item a link to the runs behind it.
 * The list is a request of its own, so it has its own states: a failure here leaves the rest of
 * the page as it is. While the next range loads, the previous range's list stays, dimmed, and
 * its links keep the range it was counted over.
 */
export function AttentionPanel({ className }: { className?: string }) {
    const [range] = useTimeRange()
    const attention = useAttention(range)
    const { data, isError, isPlaceholderData } = attention
    const { failed, retrying, failure, loading } = useQueryStatus(
        attention,
        range,
    )

    // The retry button, or the one of the stopped notice, goes away when the list recovers.
    useFocusHandoff(failed || attention.refreshing === 'stopped')

    const items = data?.data
    // The range the items were counted over: the previous one while the next loads.
    const shown = data?.range.preset ?? range
    // The count in the header is the current answer's, never the previous range's.
    const count =
        !isPlaceholderData && items !== undefined && items.length > 0
            ? items.length
            : undefined

    const body = () => {
        if (failed) {
            return (
                <PanelError
                    title="What needs attention could not be loaded"
                    message={failureMessage(failure)}
                    onRetry={() => {
                        if (!retrying) {
                            void attention.refetch()
                        }
                    }}
                />
            )
        }

        // An empty placeholder is the previous range's "nothing": it says nothing about this one.
        if (
            loading ||
            data === undefined ||
            (isPlaceholderData && data.data.length === 0)
        ) {
            return <PanelLoading rows={4} />
        }

        return (
            <>
                <RefreshNote
                    refreshing={attention.refreshing}
                    failed={isError}
                    onRetry={() => void attention.refreshAgain()}
                />
                <div
                    aria-busy={isPlaceholderData || undefined}
                    className={cn(
                        'motion-safe:transition-opacity',
                        isPlaceholderData && 'opacity-60',
                    )}
                >
                    {data.data.length === 0 ? (
                        <PanelEmpty title="Nothing needs attention in this range" />
                    ) : (
                        <AttentionCells
                            items={data.data}
                            range={shown}
                            linkFor={tracesLinkFor}
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
                {isPlaceholderData && !failed
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
