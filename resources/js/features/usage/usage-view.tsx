import { ModelPrices } from '@/features/usage/model-prices'
import { UsageBreakdown } from '@/features/usage/usage-breakdown'
import { UsageSpend } from '@/features/usage/usage-spend'
import { UsageTotals } from '@/features/usage/usage-totals'
import { useUsage } from '@/features/usage/use-usage'
import { useTimeRange } from '@/hooks/use-time-range'

/**
 * What the runs of the chosen range used and what that is estimated to cost: the totals, and the
 * breakdown under them, and the prices the cost is estimated with under that. The totals are the
 * one query the page refreshes while a run is running; the breakdown follows it, so the two share
 * one cadence and one failure notice. The prices are read once and changed by hand: saving one
 * touches no figure above it, since a recorded cost is never recalculated.
 */
export function UsageView({ className }: { className?: string }) {
    const [range] = useTimeRange()
    const usage = useUsage(range)

    return (
        <div className={className}>
            <UsageTotals usage={usage} range={range} />
            <UsageSpend
                leader={usage}
                // The totals say it already when their last refresh failed.
                refreshNoted={usage.isError && usage.data !== undefined}
                className="mt-6"
            />
            <UsageBreakdown
                leader={usage}
                // The totals say it already when their last refresh failed.
                refreshNoted={usage.isError && usage.data !== undefined}
                className="mt-6"
            />
            <ModelPrices className="mt-6" />
        </div>
    )
}
