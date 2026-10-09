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
    missingLabels,
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
    const timeZone = resolveTimeZone(useBoot().timezone)

    if (failed) {
        return null
    }

    const shown = data !== undefined && !loading ? data.data : undefined
    const series = shown?.series
    // One tree for the loading and the loaded panel, so the switch is never remounted: focus on it
    // survives the data arriving.
    const description =
        series === undefined
            ? undefined
            : descriptions[mode](bucketSpans[series.bucket])

    let body = <PanelLoading rows={6} />

    if (shown !== undefined && series !== undefined) {
        const { summary } = shown
        const labels = bucketLabels(series.bucket, series.buckets, timeZone)
        const note = mode === 'cost' ? costCaveatNote(series.buckets) : null
        // What an empty chart says claims only what is known: no runs, or no buckets to draw.
        const emptyLabel =
            summary.runs.all === 0
                ? 'No runs in this range'
                : series.buckets.length === 0 || mode === 'volume'
                  ? 'No activity to draw'
                  : missing[mode]
        const common = {
            buckets: chartBuckets(series.buckets),
            ...labels,
            formatValue: formatActivityValue,
            missingLabel: missingLabels[mode],
            summary: activitySummary(mode, summary, series.bucket),
            emptyLabel,
            zeroLabel: zero[mode],
        }

        body = (
            // A container for the chart, which can take a second column beside it later.
            <div data-slot="activity-content" className="grid gap-4">
                <div className="flex min-w-0 flex-col gap-2">
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
                        {timeZone === undefined
                            ? 'Buckets are shown in your local time zone.'
                            : `Buckets follow the application’s time zone (${timeZone}).`}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <Panel className={className}>
            {/* Always mounted, so a change of its text is announced; outside the busy part, where it may be muted. */}
            <span role="status" className="sr-only">
                {isPlaceholderData && series !== undefined
                    ? 'Loading the activity chart'
                    : ''}
            </span>
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
            <PanelContent
                aria-busy={
                    isPlaceholderData && series !== undefined ? true : undefined
                }
                className={cn(
                    'motion-safe:transition-opacity',
                    isPlaceholderData && series !== undefined && 'opacity-60',
                )}
            >
                {body}
            </PanelContent>
        </Panel>
    )
}
