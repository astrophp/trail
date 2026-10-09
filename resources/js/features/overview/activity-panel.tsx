import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelHeader } from '@/components/patterns/panel-header'
import { PanelLoading } from '@/components/patterns/panel-loading'
import { TimeSeriesChart } from '@/components/patterns/time-series-chart'
import { ActivityModeSwitch } from '@/features/overview/activity-mode-switch'
import {
    activityParams,
    type ActivityMode,
} from '@/features/overview/activity-mode'
import {
    activitySummary,
    bucketSpans,
    chartBuckets,
    costCaveatNote,
    costSeries,
    durationSeries,
    formatActivityValue,
    volumeSeries,
} from '@/features/overview/activity-series'
import { bucketLabels } from '@/features/overview/bucket-labels'
import { useOverview } from '@/features/overview/use-overview'
import { useOverviewStatus } from '@/features/overview/use-overview-status'
import { useBoot } from '@/hooks/use-boot'
import { useTimeRange } from '@/hooks/use-time-range'
import { useUrlState } from '@/hooks/use-url-state'
import { resolveTimeZone } from '@/lib/format'
import { cn } from '@/lib/utils'

/** What each view says it shows, per bucket. */
const descriptions: Record<ActivityMode, (span: string) => string> = {
    volume: (span) => `Traces started per ${span}, by outcome`,
    duration: (span) => `Average duration of the traces started per ${span}`,
    cost: (span) => `Estimated cost of the traces started per ${span}`,
}

/** What an empty chart says, for the range having runs and the view having nothing to draw. */
const missing: Record<'duration' | 'cost', string> = {
    duration: 'No duration was captured in this range',
    cost: 'No cost could be priced in this range',
}

/** What a chart of values that are all zero says. */
const zero: Record<ActivityMode, string> = {
    volume: 'No runs in this range',
    duration: 'Every measured duration in this range is zero',
    cost: 'Every priced run in this range cost nothing',
}

/**
 * The runs of the range over time: how many by outcome, their average duration, or their cost,
 * one value per bucket of the overview's series. It reads the overview the figures above it read
 * and asks for nothing of its own. While the next range loads, the previous range's chart stays,
 * dimmed, with its own buckets' labels. When the overview failed with nothing to show, the page
 * already says so once, and the panel is not drawn.
 */
export function ActivityPanel({ className }: { className?: string }) {
    const [range] = useTimeRange()
    const [{ chart: mode }, setView] = useUrlState(activityParams)
    const overview = useOverview(range)
    const { failed, loading } = useOverviewStatus(overview, range)
    const { data, isPlaceholderData } = overview
    const timeZoneName = useBoot().timezone
    const timeZone = resolveTimeZone(timeZoneName)

    if (failed) {
        return null
    }

    const header = (description?: string) => (
        <PanelHeader
            title="Trace activity"
            description={description}
            action={
                <ActivityModeSwitch
                    value={mode}
                    onValueChange={(chart) => setView({ chart })}
                />
            }
        />
    )

    if (loading || data === undefined) {
        return (
            <Panel className={className}>
                {header()}
                <PanelContent>
                    <PanelLoading rows={6} />
                </PanelContent>
            </Panel>
        )
    }

    const { summary, series } = data.data
    const labels = bucketLabels(series.bucket, series.buckets, timeZone)
    const buckets = chartBuckets(series.buckets)
    const note = mode === 'cost' ? costCaveatNote(series.buckets) : null
    const common = {
        buckets,
        ...labels,
        formatValue: formatActivityValue,
        missingLabel: 'Not captured',
        summary: activitySummary(mode, summary, series.bucket),
        emptyLabel:
            summary.runs.all === 0 || mode === 'volume'
                ? 'No runs in this range'
                : missing[mode],
        zeroLabel: zero[mode],
    }

    return (
        <Panel className={className}>
            {/* Always mounted, so a change of its text is announced; outside the busy part, where it may be muted. */}
            <span role="status" className="sr-only">
                {isPlaceholderData ? 'Loading the activity chart' : ''}
            </span>
            {header(descriptions[mode](bucketSpans[series.bucket]))}
            <PanelContent
                aria-busy={isPlaceholderData || undefined}
                className={cn(
                    'flex flex-col gap-2 motion-safe:transition-opacity',
                    isPlaceholderData && 'opacity-60',
                )}
            >
                {mode === 'volume' ? (
                    <TimeSeriesChart
                        {...common}
                        bars={volumeSeries(series.buckets)}
                    />
                ) : (
                    <TimeSeriesChart
                        {...common}
                        line={
                            mode === 'duration'
                                ? durationSeries(series.buckets)
                                : costSeries(series.buckets)
                        }
                    />
                )}
                {note === null ? null : (
                    <p
                        data-slot="cost-caveat"
                        className="text-caption text-muted-foreground"
                    >
                        {note}
                    </p>
                )}
                <p className="text-caption text-muted-foreground">
                    {timeZone === undefined || timeZoneName === null
                        ? 'Buckets follow the application’s time zone.'
                        : `Buckets follow the application’s time zone (${timeZoneName}).`}
                </p>
            </PanelContent>
        </Panel>
    )
}
