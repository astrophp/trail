import { useId, useState, type ReactElement, type ReactNode } from 'react'
import {
    Bar,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceArea,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts'
import { PanelEmpty } from '@/components/patterns/panel-empty'
import {
    buildChartModel,
    chartColorVariable,
    splitInProgress,
    thinTicks,
    type ChartBucket,
    type ChartSeries,
} from '@/components/patterns/time-series-chart-model'
import { TimeSeriesChartTable } from '@/components/patterns/time-series-chart-table'
import { tooltipTarget } from '@/components/patterns/time-series-chart-tooltip-target'
import { TimeSeriesChartTooltip } from '@/components/patterns/time-series-chart-tooltip'
import { Button } from '@/components/ui/button'
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    type ChartConfig,
} from '@/components/ui/chart'
import { useElementWidth } from '@/hooks/use-element-width'
import { cn } from '@/lib/utils'

export type {
    ChartBucket,
    ChartColor,
    ChartSeries,
} from '@/components/patterns/time-series-chart-model'

/** How the chart is drawn, as numbers Recharts needs. */
const margin = { top: 8, right: 16, bottom: 0, left: 0 }
/** Room above the plot for the label of a divider. */
const dividerMarginTop = 20
const shadeOpacity = 0.08
const maxBarSize = 48
const dashedSegment = '4 3'
const lineWidth = 2
const dotRadius = 3
/** A line's first and last point sit on the edge of the plot; this keeps their labels in view. */
const linePadding = { left: 12, right: 12 }
/** The width before the container is measured. */
const initialWidth = 320
const characterWidth = 7
const yAxisPadding = 8

/**
 * The width left for the x axis: the container's, less what the y axis, the margins and a line's
 * padding take. The y axis width, the margins and the padding are the ones passed to Recharts.
 */
function plotWidth(width: number, yAxisWidth: number, isLine: boolean) {
    return (
        width -
        yAxisWidth -
        margin.left -
        margin.right -
        (isLine ? linePadding.left + linePadding.right : 0)
    )
}

type Shared = {
    buckets: ChartBucket[]
    /** The short label under the x axis. Called for every bucket; the chart thins what it shows. */
    formatTick: (bucket: ChartBucket, index: number) => string
    /** The full label of a bucket: the tooltip's title and the table's row header. */
    formatBucket: (bucket: ChartBucket) => string
    /**
     * A value as text, for the y axis, the tooltip and the table. The y axis uses the first
     * series' key, so every series should share a unit.
     */
    formatValue: (value: number, seriesKey: string) => string
    /** Drawn in the tooltip and the table for a value that was not captured. */
    missingLabel: string
    /**
     * The chart's text equivalent, in a sentence. It is the drawing's label and the table's
     * caption. The drawing, legend included, is hidden from assistive technology, so the summary
     * must name what the chart shows (every series) and say what it says.
     */
    summary: string
    /** The heading of the column of bucket labels in the table. Defaults to "Time". */
    bucketColumnLabel?: string
    /** Shown in place of the chart when there are no buckets, or no bucket has a value. */
    emptyLabel: string
    /** Said under the chart when every value is 0. */
    zeroLabel: string
    /** The words that mark a bucket still filling. */
    inProgressLabel?: string
    /** The button that shows the table, and the same button when it is shown. */
    showDataLabel?: string
    hideDataLabel?: string
    /**
     * A vertical line at the bucket in this position (counting from 0), with `label` on it: a
     * boundary in the data, such as the last bucket that was recorded.
     */
    divider?: { at: number; label: string }
    /** Shades the chart from the bucket in this position to the last one: the part that is not recorded. */
    shadeFrom?: number
    /**
     * The content of the table behind the data button, in place of the default one: for values
     * that need more than text, such as a state beside an amount. It must carry the same numbers
     * as the chart and name itself (a caption).
     */
    table?: ReactNode
    /** The height of the chart, as a class. */
    chartClassName?: string
    className?: string
}

export type TimeSeriesChartProps = Shared &
    (
        | {
              /** Stacked in order, the first at the bottom. */
              bars: ChartSeries[]
              line?: never
              dashedLine?: never
          }
        | {
              line: ChartSeries
              /**
               * A second line, drawn dashed and without points after the first: a projection of it.
               * It is in the legend, the tooltip and the table like any series, and may carry a
               * `span` so that it speaks only for the buckets it covers.
               */
              dashedLine?: ChartSeries
              bars?: never
          }
    )

type DotProps = { cx?: number; cy?: number; payload?: { inProgress?: boolean } }

/**
 * Values over time buckets: stacked bars, or one line. A bucket still filling is drawn dimmed
 * (bars) or as a dashed segment ending in a hollow dot (line), and named in words above the
 * chart. A value that was not captured breaks the line and draws no bar; it is never a 0. The
 * chart is described by `summary`, and the same numbers are a table behind a button; the drawing
 * itself is hidden from assistive technology.
 */
export function TimeSeriesChart({
    buckets,
    bars,
    line,
    dashedLine,
    divider,
    shadeFrom,
    table,
    formatTick,
    formatBucket,
    formatValue,
    missingLabel,
    summary,
    bucketColumnLabel = 'Time',
    emptyLabel,
    zeroLabel,
    inProgressLabel = 'In progress',
    showDataLabel = 'View data',
    hideDataLabel = 'Hide data',
    chartClassName = 'h-48',
    className,
}: TimeSeriesChartProps) {
    const series =
        bars ?? (line ? [line, ...(dashedLine ? [dashedLine] : [])] : [])
    const model = buildChartModel({
        buckets,
        series,
        stacked: bars !== undefined,
        formatBucket,
        formatTick,
    })
    const [measure, width] = useElementWidth(initialWidth)
    const tableId = useId()
    const [open, setOpen] = useState(false)

    if (model.status === 'empty') {
        return (
            <div data-slot="time-series-chart" className={className}>
                <p className="sr-only">{summary}</p>
                <PanelEmpty title={emptyLabel} />
            </div>
        )
    }

    const config: ChartConfig = Object.fromEntries(
        series.map((one, index) => [
            `s${index}`,
            { label: one.label, color: chartColorVariable(one.color) },
        ]),
    )
    const first = series[0]
    const yLabels = model.axis.ticks.map((tick) =>
        first ? formatValue(tick, first.key) : '',
    )
    // Room for the widest tick label.
    const yAxisWidth =
        Math.max(...yLabels.map((label) => label.length)) * characterWidth +
        yAxisPadding
    const shown = new Set(
        thinTicks(
            model.rows.map((row) => row.tick),
            plotWidth(width, yAxisWidth, line !== undefined),
        ),
    )
    // Rows are told apart by position, so two buckets with one key still make two categories.
    const tickIndexes = model.rows.flatMap((_, index) =>
        shown.has(index) ? [index] : [],
    )
    const filling = model.rows.filter((row) => row.inProgress)
    const data = model.rows.map((row, index) => {
        const record: Record<string, string | number | boolean | null> = {
            index,
            inProgress: row.inProgress,
        }

        series.forEach((_, index) => {
            record[`s${index}`] = row.values[index] ?? null
        })

        return record
    })

    const split = line
        ? splitInProgress(
              model.rows.map((row) => row.values[0] ?? null),
              model.rows.map((row) => row.inProgress),
          )
        : undefined

    if (split) {
        model.rows.forEach((_, index) => {
            const record = data[index]

            if (record) {
                record.s0 = split.solid[index] ?? null
                record['s0-pending'] = split.pending[index] ?? null
            }
        })
    }

    return (
        <div
            data-slot="time-series-chart"
            className={cn('flex flex-col gap-2', className)}
        >
            {filling.length > 0 ? (
                <p
                    data-slot="time-series-chart-in-progress"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                    <span
                        aria-hidden="true"
                        className={cn(
                            'size-2 shrink-0',
                            line
                                ? 'rounded-full border border-muted-foreground bg-card'
                                : 'rounded-xs bg-muted-foreground/40',
                        )}
                    />
                    {`${inProgressLabel}: ${filling.map((row) => row.label).join(', ')}`}
                </p>
            ) : null}
            <div ref={measure} role="img" aria-label={summary}>
                <ChartContainer
                    config={config}
                    className={cn(
                        'aspect-auto w-full [&_.recharts-cartesian-axis-line]:stroke-border',
                        chartClassName,
                    )}
                >
                    <ComposedChart
                        data={data}
                        margin={
                            divider
                                ? { ...margin, top: dividerMarginTop }
                                : margin
                        }
                        accessibilityLayer={false}
                    >
                        <CartesianGrid vertical={false} />
                        <XAxis
                            dataKey="index"
                            ticks={tickIndexes}
                            interval={0}
                            tickLine={false}
                            tickMargin={8}
                            padding={line ? linePadding : undefined}
                            tickFormatter={(index: number) =>
                                model.rows[index]?.tick ?? ''
                            }
                        />
                        <YAxis
                            width={yAxisWidth}
                            domain={[0, model.axis.top]}
                            // Without it Recharts 3 draws no ticks when every stacked value is 0.
                            allowDataOverflow
                            ticks={model.axis.ticks}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value: number) =>
                                yLabels[model.axis.ticks.indexOf(value)] ?? ''
                            }
                        />
                        <ChartTooltip
                            content={(props) => {
                                const target = tooltipTarget(props)

                                return (
                                    <TimeSeriesChartTooltip
                                        model={model}
                                        active={target.active}
                                        bucketIndex={target.index}
                                        missingLabel={missingLabel}
                                        inProgressLabel={inProgressLabel}
                                        formatValue={formatValue}
                                    />
                                )
                            }}
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                        {shadeFrom !== undefined &&
                        shadeFrom < model.rows.length - 1 ? (
                            <ReferenceArea
                                x1={shadeFrom}
                                x2={model.rows.length - 1}
                                fill="var(--muted-foreground)"
                                fillOpacity={shadeOpacity}
                                stroke="none"
                                ifOverflow="visible"
                            />
                        ) : null}
                        {divider ? (
                            <ReferenceLine
                                x={divider.at}
                                stroke="var(--border)"
                                strokeDasharray={dashedSegment}
                                ifOverflow="visible"
                                label={{
                                    value: divider.label,
                                    position: 'top',
                                    className:
                                        'fill-muted-foreground text-caption',
                                }}
                            />
                        ) : null}
                        {bars?.map((one, index) => (
                            <Bar
                                key={one.key}
                                dataKey={`s${index}`}
                                stackId="stack"
                                fill={`var(--color-s${index})`}
                                maxBarSize={maxBarSize}
                                isAnimationActive={false}
                                shape={dimmedWhenInProgress}
                            />
                        ))}
                        {line ? (
                            <Line
                                dataKey="s0"
                                stroke="var(--color-s0)"
                                strokeWidth={lineWidth}
                                connectNulls={false}
                                isAnimationActive={false}
                                dot={solidDot}
                            />
                        ) : null}
                        {dashedLine ? (
                            <Line
                                dataKey="s1"
                                stroke="var(--color-s1)"
                                strokeWidth={lineWidth}
                                strokeDasharray={dashedSegment}
                                connectNulls={false}
                                isAnimationActive={false}
                                dot={false}
                            />
                        ) : null}
                        {line && filling.length > 0 ? (
                            <Line
                                dataKey="s0-pending"
                                stroke="var(--color-s0)"
                                strokeWidth={lineWidth}
                                strokeDasharray={dashedSegment}
                                connectNulls={false}
                                isAnimationActive={false}
                                legendType="none"
                                tooltipType="none"
                                activeDot={false}
                                dot={hollowDot}
                            />
                        ) : null}
                    </ComposedChart>
                </ChartContainer>
            </div>
            {model.status === 'zero' ? (
                <p className="text-xs text-muted-foreground">{zeroLabel}</p>
            ) : null}
            <div>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-expanded={open}
                    aria-controls={tableId}
                    onClick={() => setOpen((value) => !value)}
                >
                    {open ? hideDataLabel : showDataLabel}
                </Button>
            </div>
            <div id={tableId} hidden={!open}>
                {table ?? (
                    <TimeSeriesChartTable
                        model={model}
                        caption={summary}
                        bucketColumnLabel={bucketColumnLabel}
                        missingLabel={missingLabel}
                        inProgressLabel={inProgressLabel}
                        formatValue={formatValue}
                    />
                )}
            </div>
        </div>
    )
}

const solidDot = (props: DotProps) => pointOf(props, 'solid')
const hollowDot = (props: DotProps) => pointOf(props, 'hollow')

type BarShapeProps = {
    x?: number
    y?: number
    width?: number
    height?: number
    fill?: string
    payload?: { inProgress?: boolean }
}

/** A bar of a bucket still filling is dimmed; a bar with no usable size is not drawn. */
function dimmedWhenInProgress(props: BarShapeProps): ReactElement {
    const { x, y, width, height, fill, payload } = props

    if (
        x === undefined ||
        y === undefined ||
        width === undefined ||
        height === undefined ||
        !Number.isFinite(y) ||
        !Number.isFinite(height)
    ) {
        return <g />
    }

    return (
        <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill={fill}
            fillOpacity={payload?.inProgress ? 0.4 : 1}
        />
    )
}

/** A point of the line: solid for a complete bucket, hollow for one still filling. */
function pointOf(
    { cx, cy, payload }: DotProps,
    kind: 'solid' | 'hollow',
): ReactElement {
    if (cx === undefined || cy === undefined || !Number.isFinite(cy)) {
        return <g />
    }

    // The dashed line draws a point only for the bucket still filling.
    if (kind === 'hollow' && !payload?.inProgress) {
        return <g />
    }

    return (
        <circle
            cx={cx}
            cy={cy}
            r={dotRadius}
            stroke="var(--color-s0)"
            strokeWidth={lineWidth}
            className={kind === 'hollow' ? 'fill-card' : undefined}
            fill={kind === 'solid' ? 'var(--color-s0)' : undefined}
        />
    )
}
