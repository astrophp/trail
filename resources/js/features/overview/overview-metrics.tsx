import { MetricStripSkeleton } from '@/components/patterns/metric-strip-skeleton'
import { ErrorState } from '@/components/patterns/error-state'
import { BusyRegion } from '@/components/patterns/busy-region'
import { Notice } from '@/components/patterns/notice'
import { RefreshNote } from '@/components/patterns/refresh-note'
import { SummaryStrip } from '@/components/telemetry/summary-strip'
import { tracesLink } from '@/api/traces-link'
import { useOverview } from '@/features/overview/use-overview'
import { useQueryStatus } from '@/hooks/use-query-status'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { useTimeRange } from '@/hooks/use-time-range'

/**
 * The headline figures of the time range, each against the previous period and linked to the runs
 * behind it. While the next range loads, the previous range's figures stay, dimmed, under their
 * own range's words and links.
 */
export function OverviewMetrics({ className }: { className?: string }) {
    const [range] = useTimeRange()
    const overview = useOverview(range)
    const { data, isError, isPlaceholderData, refetch } = overview
    const { failed, retrying, failure, loading } = useQueryStatus(
        overview,
        range,
    )

    // The retry button, or the one of the stopped notice, goes away when the page recovers.
    useFocusHandoff(failed || overview.refreshing === 'stopped')

    if (failed) {
        return (
            <ErrorState
                title="The overview could not be loaded"
                error={failure}
                retrying={retrying}
                className={className}
                onRetry={() => void refetch()}
            />
        )
    }

    if (loading || data === undefined) {
        return <MetricStripSkeleton count={4} className={className} />
    }

    const { summary, previous } = data.data
    // The range the figures are for: the previous one while the next loads.
    const shown = data.range.preset ?? range
    const metric = { summary, previous, range: shown, link: tracesLink }

    return (
        <div className={className}>
            <RefreshNote
                refreshing={overview.refreshing}
                failed={isError}
                onRetry={() => void overview.refreshAgain()}
            />
            <BusyRegion busy={isPlaceholderData}>
                {summary.runs.all === 0 ? (
                    <Notice
                        tone="info"
                        title="No runs were recorded in the selected range."
                        className="mb-4"
                    >
                        {shown === '7d' ? null : 'Try a longer range.'}
                    </Notice>
                ) : null}
                <SummaryStrip {...metric} />
            </BusyRegion>
        </div>
    )
}
