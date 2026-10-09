import { tracesLink } from '@/api/traces-link'
import { BusyRegion } from '@/components/patterns/busy-region'
import { ErrorState } from '@/components/patterns/error-state'
import { MetricStrip } from '@/components/patterns/metric-strip'
import { MetricStripSkeleton } from '@/components/patterns/metric-strip-skeleton'
import { RefreshNote } from '@/components/patterns/refresh-note'
import { CostMetric } from '@/components/telemetry/cost-metric'
import { CoverageMetric } from '@/features/usage/coverage-metric'
import { TokensMetric } from '@/features/usage/tokens-metric'
import type { UsageQuery } from '@/features/usage/use-usage'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { useQueryStatus } from '@/hooks/use-query-status'
import type { TimeRangePreset } from '@/lib/time-range'

type UsageTotalsProps = {
    /** The page's one query for the totals. */
    usage: UsageQuery
    range: TimeRangePreset
    className?: string
}

/**
 * What the runs of the range used and what that is estimated to cost: the cost, the tokens and
 * how much of the usage could be priced. While the next range loads, the previous range's figures
 * stay, dimmed, under their own range's links.
 */
export function UsageTotals({ usage, range, className }: UsageTotalsProps) {
    const { data, isError, isPlaceholderData, refetch } = usage
    const { failed, retrying, failure, loading } = useQueryStatus(usage, range)

    // The retry button, or the one of the stopped notice, goes away when the totals load.
    useFocusHandoff(failed || usage.refreshing === 'stopped')

    if (failed) {
        return (
            <ErrorState
                title="The usage totals could not be loaded"
                error={failure}
                retrying={retrying}
                className={className}
                onRetry={() => {
                    if (!retrying) {
                        void refetch()
                    }
                }}
            />
        )
    }

    if (loading || data === undefined) {
        return <MetricStripSkeleton count={3} className={className} />
    }

    const { summary, coverage } = data.data
    // The range the figures are for: the previous one while the next loads.
    const shown = data.range.preset ?? range

    return (
        <div className={className}>
            <RefreshNote
                refreshing={usage.refreshing}
                failed={isError}
                onRetry={() => void usage.refreshAgain()}
            />
            <BusyRegion busy={isPlaceholderData} label="Loading the totals">
                <MetricStrip>
                    <CostMetric
                        summary={summary}
                        previous={null}
                        range={shown}
                        link={tracesLink}
                    />
                    <TokensMetric usage={summary.usage} />
                    <CoverageMetric
                        summary={summary}
                        coverage={coverage}
                        range={shown}
                    />
                </MetricStrip>
            </BusyRegion>
        </div>
    )
}
