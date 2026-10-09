import type { Series, Summary } from '@/api/types'
import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelHeader } from '@/components/patterns/panel-header'
import { PanelLoading } from '@/components/patterns/panel-loading'
import { TimeSeriesChart } from '@/components/patterns/time-series-chart'
import { type ActivityMode } from '@/components/telemetry/activity-mode'
import { ActivityModeSwitch } from '@/components/telemetry/activity-mode-switch'
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
} from '@/components/telemetry/activity-series'
import { bucketLabels } from '@/components/telemetry/bucket-labels'
import { useBoot } from '@/hooks/use-boot'
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

type ActivityChartProps = {
    /** The range cut into buckets; `undefined` while there is none to draw. */
    series: Series | undefined
    /** What the series adds up to, which the chart's text equivalent and empty states follow. */
    summary: Summary | undefined
    mode: ActivityMode
    onModeChange: (mode: ActivityMode) => void
    /** The series is the previous view's: it is drawn dimmed and announced as loading. */
    busy?: boolean
    className?: string
}

/**
 * The runs of a range over time: how many by outcome, their average duration, or their cost, one
 * value per bucket of the series. It draws what it is given and asks for nothing. While there is
 * no series it holds the place of the chart, with the mode switch where it will stay: one tree for
 * the loading and the loaded panel, so focus on the switch survives the data arriving.
 */
export function ActivityChart({
    series,
    summary,
    mode,
    onModeChange,
    busy = false,
    className,
}: ActivityChartProps) {
    const timeZone = resolveTimeZone(useBoot().timezone)
    const dimmed = busy && series !== undefined
    const description =
        series === undefined
            ? undefined
            : descriptions[mode](bucketSpans[series.bucket])

    let body = <PanelLoading rows={6} />

    if (series !== undefined && summary !== undefined) {
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
                {dimmed ? 'Loading the activity chart' : ''}
            </span>
            <PanelHeader
                title="Trace activity"
                description={description}
                action={
                    <ActivityModeSwitch
                        value={mode}
                        onValueChange={onModeChange}
                    />
                }
            />
            <PanelContent
                aria-busy={dimmed ? true : undefined}
                className={cn(
                    'motion-safe:transition-opacity',
                    dimmed && 'opacity-60',
                )}
            >
                {body}
            </PanelContent>
        </Panel>
    )
}
