import {
    chartColorVariable,
    type ChartModel,
} from '@/components/patterns/time-series-chart-model'
import { cn } from '@/lib/utils'

type TimeSeriesChartTooltipProps = {
    model: ChartModel
    /** The position of the bucket under the pointer. Nothing is drawn without one that exists. */
    bucketIndex: number | undefined
    active?: boolean
    missingLabel: string
    inProgressLabel: string
    formatValue: (value: number, seriesKey: string) => string
    className?: string
}

/**
 * What a `TimeSeriesChart` says about the bucket under the pointer: its label, and a row per
 * series with its value, or `missingLabel` when none was captured. It reads the chart's own
 * prepared rows, so it says what the table says.
 */
export function TimeSeriesChartTooltip({
    model,
    bucketIndex,
    active = true,
    missingLabel,
    inProgressLabel,
    formatValue,
    className,
}: TimeSeriesChartTooltipProps) {
    const row = bucketIndex === undefined ? undefined : model.rows[bucketIndex]

    if (!active || !row) {
        return null
    }

    return (
        <div
            data-slot="time-series-chart-tooltip"
            className={cn(
                'grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl',
                className,
            )}
        >
            <div className="font-medium">
                {row.label}
                {row.inProgress ? (
                    <span className="font-normal text-muted-foreground">
                        {` (${inProgressLabel})`}
                    </span>
                ) : null}
            </div>
            <div className="grid gap-1.5">
                {model.series.map((series, index) => {
                    const value = row.values[index] ?? null

                    return (
                        <div
                            key={series.key}
                            className="flex items-center gap-2"
                        >
                            <span
                                aria-hidden="true"
                                className="size-2.5 shrink-0 rounded-xs"
                                style={{
                                    backgroundColor: chartColorVariable(
                                        series.color,
                                    ),
                                }}
                            />
                            <span className="flex-1 text-muted-foreground">
                                {series.label}
                            </span>
                            <span
                                className={cn(
                                    'font-mono font-medium tabular-nums',
                                    value === null
                                        ? 'text-muted-foreground'
                                        : 'text-foreground',
                                )}
                            >
                                {value === null
                                    ? missingLabel
                                    : formatValue(value, series.key)}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
