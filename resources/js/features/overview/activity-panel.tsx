import type { Leader } from '@/lib/refresh-policy'
import type { ReactNode } from 'react'
import { ActivityChart } from '@/components/telemetry/activity-chart'
import {
    activityParams,
    type ActivityMode,
} from '@/components/telemetry/activity-mode'
import { useOverview } from '@/features/overview/use-overview'
import { useQueryStatus } from '@/hooks/use-query-status'
import { useTimeRange } from '@/hooks/use-time-range'
import { useUrlState } from '@/hooks/use-url-state'
import type {} from '@/lib/refresh-policy'

/** What a page that places something beside the chart is told about the chart and the overview behind it. */
export type OverviewSlot = {
    /** What the chart shows, which whatever is placed beside it can follow. */
    metric: ActivityMode
    /** The overview's own query: whatever is placed keeps up with it while a run is running. */
    leader: Leader
}

type ActivityPanelProps = {
    /** What the page places beside the chart. Left out, the chart has the whole width. */
    aside?: (slot: OverviewSlot) => ReactNode
    className?: string
}

/**
 * The runs of the range over time. It reads the overview the figures above it read and asks for
 * nothing of its own. While the next range loads, the previous range's chart stays, dimmed, with
 * its own buckets' labels. When the overview failed with nothing to show, the page already says so
 * once, and the panel is not drawn.
 */
export function ActivityPanel({ aside, className }: ActivityPanelProps) {
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
            aside={aside?.({
                metric: mode,
                leader: {
                    dataUpdatedAt: overview.dataUpdatedAt,
                    isPlaceholderData,
                    refreshing: overview.refreshing,
                },
            })}
            className={className}
        />
    )
}
