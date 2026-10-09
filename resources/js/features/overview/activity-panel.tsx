import { ActivityChart } from '@/components/telemetry/activity-chart'
import { activityParams } from '@/components/telemetry/activity-mode'
import { useOverview } from '@/features/overview/use-overview'
import { useQueryStatus } from '@/hooks/use-query-status'
import { useTimeRange } from '@/hooks/use-time-range'
import { useUrlState } from '@/hooks/use-url-state'

/**
 * The runs of the range over time. It reads the overview the figures above it read and asks for
 * nothing of its own. While the next range loads, the previous range's chart stays, dimmed, with
 * its own buckets' labels. When the overview failed with nothing to show, the page already says so
 * once, and the panel is not drawn.
 */
export function ActivityPanel({ className }: { className?: string }) {
    const [range] = useTimeRange()
    const [{ chart: mode }, setView] = useUrlState(activityParams)
    const overview = useOverview(range)
    const { failed, loading } = useQueryStatus(overview, range)
    const { data, isPlaceholderData } = overview

    if (failed) {
        return null
    }

    const shown = data !== undefined && !loading ? data.data : undefined

    return (
        <ActivityChart
            series={shown?.series}
            summary={shown?.summary}
            mode={mode}
            onModeChange={(chart) => setView({ chart })}
            busy={isPlaceholderData}
            className={className}
        />
    )
}
