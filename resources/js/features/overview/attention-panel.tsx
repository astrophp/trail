import { failureMessage } from '@/api/client'
import { tracesLinkFor } from '@/api/traces-link'
import { RefreshNote } from '@/components/patterns/refresh-note'
import { AttentionSection } from '@/components/telemetry/attention-section'
import { useAttention } from '@/features/overview/use-attention'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { useQueryStatus } from '@/hooks/use-query-status'
import { useTimeRange } from '@/hooks/use-time-range'

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

    return (
        <AttentionSection
            items={loading || failed ? undefined : data?.data}
            // The range the items were counted over: the previous one while the next loads.
            range={data?.range.preset ?? range}
            linkFor={tracesLinkFor}
            busy={isPlaceholderData}
            failure={
                failed
                    ? {
                          message: failureMessage(failure),
                          onRetry: () => {
                              if (!retrying) {
                                  void attention.refetch()
                              }
                          },
                      }
                    : undefined
            }
            note={
                <RefreshNote
                    refreshing={attention.refreshing}
                    failed={isError}
                    onRetry={() => void attention.refreshAgain()}
                />
            }
            className={className}
        />
    )
}
