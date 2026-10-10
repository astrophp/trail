// The numbers of a `TimeSeriesChart`, prepared once. The chart, its tooltip and its data table all
// read this one structure, so they cannot disagree. Nothing here formats a value or a date.

/** The theme tokens a series can be drawn in. Light and dark come from the tokens. */
export type ChartColor =
    | 'chart-1'
    | 'chart-2'
    | 'chart-3'
    | 'chart-4'
    | 'chart-5'
    | 'destructive'
    | 'warning'
    | 'success'
    | 'info'

const colorVariables: Record<ChartColor, string> = {
    'chart-1': 'var(--chart-1)',
    'chart-2': 'var(--chart-2)',
    'chart-3': 'var(--chart-3)',
    'chart-4': 'var(--chart-4)',
    'chart-5': 'var(--chart-5)',
    destructive: 'var(--destructive)',
    warning: 'var(--warning)',
    success: 'var(--success)',
    info: 'var(--info)',
}

/** The CSS variable of a token, for a `ChartConfig` colour. */
export function chartColorVariable(color: ChartColor): string {
    return colorVariables[color]
}

export type ChartBucket = {
    /** Unique among the buckets. */
    key: string
    from: Date
    to: Date
    /** The bucket is still filling: its values are not final. */
    inProgress: boolean
}

export type ChartSeries = {
    /** Unique among the series. Passed back to `formatValue`. */
    key: string
    label: string
    color: ChartColor
    /**
     * One value per bucket, in the buckets' order. `null` is not captured, and is not 0. A value
     * that cannot be drawn on an axis that starts at 0 (below 0, NaN, an infinity) is treated as
     * not captured, never drawn as something it is not.
     */
    values: (number | null)[]
    /**
     * The buckets, by position and both included, that the series speaks for. Outside them it has
     * no value and says nothing: no row in the tooltip, an empty cell in the table, and a value
     * given there is not drawn. Defaults to every bucket. For a series that only exists over part
     * of the range, such as a projection.
     */
    span?: { from?: number; to?: number }
    /**
     * A bucket, by position, where the series is drawn but not reported: the point only joins its
     * line to another one. The tooltip has no row for it and the table an empty cell, so the value
     * is never read as the series' own.
     */
    anchor?: number
}

export type ChartRow = {
    /** The bucket's key. */
    key: string
    bucket: ChartBucket
    /** The full label of the bucket. */
    label: string
    /** The short label for the x axis. */
    tick: string
    inProgress: boolean
    /** One value per series, in the series' order. */
    values: (number | null)[]
    /** One flag per series: the bucket is in the series' span. Where it is not, the series says nothing. */
    applies: boolean[]
    /** One flag per series: the bucket is in the span and is not the series' anchor. Only a reported value is told. */
    reported: boolean[]
}

export type ChartModel = {
    rows: ChartRow[]
    series: ChartSeries[]
    /**
     * `empty`: no buckets, no value in any of them, or numbers too large to put on an axis. `zero`: values exist and every one is 0.
     * `data`: something to draw.
     */
    status: 'empty' | 'zero' | 'data'
    /** The y axis: where it ends, and where its ticks are. Always starts at 0. */
    axis: { top: number; ticks: number[] }
}

/** A value the chart can draw: finite and not below 0. Anything else is treated as not captured. */
function usable(value: number | null | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : null
}

/** Whether the series speaks for the bucket at `index`. */
function inSpan(series: ChartSeries, index: number): boolean {
    const { from = 0, to = Number.POSITIVE_INFINITY } = series.span ?? {}

    return index >= from && index <= to
}

/**
 * Rounded tick positions from 0 to the first multiple of a round step at or above `max`.
 * A maximum of 0 (or less) gives an axis from 0 to 1, so it has height and two different ticks.
 */
export function niceAxis(
    max: number,
    targetTicks = 4,
): { top: number; ticks: number[] } {
    if (!(max > 0) || !Number.isFinite(max)) {
        return { top: 1, ticks: [0, 1] }
    }

    const rough = max / targetTicks
    const magnitude = 10 ** Math.floor(Math.log10(rough))
    const residual = rough / magnitude
    const factor = [1, 2, 2.5, 5, 10].find((candidate) => residual <= candidate)
    const step = (factor ?? 10) * magnitude
    const count = Math.max(1, Math.ceil(max / step - 1e-9))
    // Twelve significant digits: 3 × 0.1 is 0.3, not 0.30000000000000004.
    const at = (index: number) => Number((index * step).toPrecision(12))
    const ticks = Array.from({ length: count + 1 }, (_, index) => at(index))

    return { top: at(count), ticks }
}

/**
 * Prepares the rows and the axis. `stacked` adds a bucket's series up for the height of the axis
 * (bars); otherwise the tallest single value sets it (a line).
 */
export function buildChartModel(input: {
    buckets: ChartBucket[]
    series: ChartSeries[]
    stacked: boolean
    formatBucket: (bucket: ChartBucket) => string
    formatTick: (bucket: ChartBucket, index: number) => string
}): ChartModel {
    const { buckets, series, stacked, formatBucket, formatTick } = input

    const rows = buckets.map((bucket, index): ChartRow => {
        const applies = series.map((one) => inSpan(one, index))

        return {
            key: bucket.key,
            bucket,
            label: formatBucket(bucket),
            tick: formatTick(bucket, index),
            inProgress: bucket.inProgress,
            values: series.map((one, at) =>
                applies[at] ? usable(one.values[index]) : null,
            ),
            applies,
            reported: series.map(
                (one, at) => applies[at] === true && one.anchor !== index,
            ),
        }
    })

    const heights = rows.map((row) => {
        const present = row.values.filter(
            (value): value is number => value !== null,
        )

        if (present.length === 0) {
            return null
        }

        // A sum of finite values can still overflow; that height cannot be drawn.
        return usable(
            stacked
                ? present.reduce((sum, value) => sum + value, 0)
                : Math.max(...present),
        )
    })
    const known = heights.filter((height): height is number => height !== null)
    const overflowed = rows.some(
        (row, index) =>
            heights[index] === null &&
            row.values.some((value) => value !== null),
    )

    if (known.length === 0 || overflowed) {
        return { rows, series, status: 'empty', axis: niceAxis(0) }
    }

    const tallest = Math.max(...known)
    const axis = niceAxis(tallest)

    // A top that rounds up past the largest number cannot be drawn either.
    if (!Number.isFinite(axis.top) || !axis.ticks.every(Number.isFinite)) {
        return { rows, series, status: 'empty', axis: niceAxis(0) }
    }

    return {
        rows,
        series,
        status: tallest === 0 ? 'zero' : 'data',
        axis,
    }
}

/**
 * Which ticks of the x axis to label so that labels never touch: every n-th bucket, counted back
 * from the last one (the newest is always labelled). A slot is as wide as the longest label.
 * Returns the indexes, in order.
 */
export function thinTicks(
    labels: string[],
    width: number,
    options: { characterWidth?: number; gap?: number } = {},
): number[] {
    const { characterWidth = 7, gap = 12 } = options

    if (labels.length === 0) {
        return []
    }

    const longest = Math.max(...labels.map((label) => label.length), 1)
    const slot = longest * characterWidth + gap
    const fit = Math.max(1, Math.floor(width / slot))
    const every = Math.max(1, Math.ceil(labels.length / fit))
    const last = labels.length - 1

    return labels
        .map((_, index) => index)
        .filter((index) => (last - index) % every === 0)
}

/**
 * A line drawn in two parts, so the part that is not final can look different. `solid` holds the
 * complete buckets. `pending` holds the in-progress values and the complete value just before
 * each one, so the dashed segment starts where the solid line stops. Everything else is `null`.
 */
export function splitInProgress(
    values: (number | null)[],
    inProgress: boolean[],
): { solid: (number | null)[]; pending: (number | null)[] } {
    return {
        solid: values.map((value, index) => (inProgress[index] ? null : value)),
        pending: values.map((value, index) => {
            if (value === null) {
                return null
            }

            if (inProgress[index]) {
                return value
            }

            // The complete bucket before an in-progress one, only when that one has a value.
            return inProgress[index + 1] && values[index + 1] !== null
                ? value
                : null
        }),
    }
}
