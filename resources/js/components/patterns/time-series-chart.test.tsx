import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimeSeriesChart } from '@/components/patterns/time-series-chart'
import {
    formatBucket,
    formatTick,
    formatValue,
    hourlyBuckets,
    words,
} from '@/components/patterns/time-series-chart-fixtures'
import type { ChartSeries } from '@/components/patterns/time-series-chart-model'

const summary = 'An invented series over a few hours.'

type Props = ComponentProps<typeof TimeSeriesChart>

function renderChart(
    props: Partial<Props> & ({ bars: ChartSeries[] } | { line: ChartSeries }),
) {
    const buckets =
        props.buckets ??
        hourlyBuckets(
            ('bars' in props ? props.bars?.[0]?.values.length : undefined) ??
                ('line' in props ? props.line?.values.length : undefined) ??
                0,
        )

    return render(
        <TimeSeriesChart
            {...words}
            formatBucket={formatBucket}
            formatTick={formatTick}
            formatValue={formatValue}
            summary={summary}
            {...props}
            buckets={buckets}
        />,
    )
}

const bar = (values: (number | null)[]): ChartSeries => ({
    key: 'alpha',
    label: 'Alpha',
    color: 'chart-1',
    values,
})

const line = (values: (number | null)[]): ChartSeries => ({
    key: 'level',
    label: 'Level',
    color: 'chart-2',
    values,
})

/** The heights of the bars drawn, in order. */
const barHeights = (container: HTMLElement) =>
    [...container.querySelectorAll('.recharts-bar-rectangle rect')].map(
        (rect) => Number(rect.getAttribute('height')),
    )

const xLabels = (container: HTMLElement) =>
    [
        ...container.querySelectorAll(
            '.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value',
        ),
    ].map((label) => label.textContent)

const yLabels = (container: HTMLElement) =>
    [
        ...container.querySelectorAll(
            '.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value',
        ),
    ].map((label) => label.textContent)

const measured = vi.hoisted(() => ({ width: 320 }))

// jsdom measures nothing: the width the chart believes its container has is set here.
vi.mock('@/hooks/use-element-width', () => ({
    useElementWidth: () => [() => {}, measured.width],
}))

const stubWidth = (width: number) => {
    measured.width = width
}

afterEach(() => {
    measured.width = 320
})

describe('TimeSeriesChart: the text equivalent', () => {
    it('is one image named by the summary, with nothing in it to tab to', () => {
        const { container } = renderChart({ bars: [bar([1, 2, 3])] })

        expect(screen.getByRole('img', { name: summary })).toBeInTheDocument()
        expect(container.querySelector('[tabindex="0"]')).toBeNull()
    })

    it('has one control to reach, the button that shows the table', async () => {
        renderChart({ bars: [bar([1, 2, 3])] })

        await userEvent.tab()

        expect(screen.getByRole('button', { name: 'View data' })).toHaveFocus()
    })

    it('keeps the table out until it is asked for, and the button says so', async () => {
        renderChart({ bars: [bar([1, 2, 3])] })

        const button = screen.getByRole('button', { name: 'View data' })

        expect(button).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByRole('table')).toBeNull()

        await userEvent.click(button)

        const table = screen.getByRole('table', { name: summary })

        expect(
            screen.getByRole('button', { name: 'Hide data' }),
        ).toHaveAttribute('aria-expanded', 'true')
        expect(
            document.getElementById(
                screen
                    .getByRole('button', { name: 'Hide data' })
                    .getAttribute('aria-controls') ?? '',
            ),
        ).toContainElement(table)

        await userEvent.click(screen.getByRole('button', { name: 'Hide data' }))

        expect(screen.queryByRole('table')).toBeNull()
    })

    it('opens the table from the keyboard', async () => {
        renderChart({ bars: [bar([1, 2, 3])] })

        await userEvent.tab()
        await userEvent.keyboard('{Enter}')

        expect(screen.getByRole('table')).toBeInTheDocument()
    })

    it('takes the words of the buttons from the caller', () => {
        renderChart({
            bars: [bar([1])],
            showDataLabel: 'Show the numbers',
            hideDataLabel: 'Hide the numbers',
        })

        expect(
            screen.getByRole('button', { name: 'Show the numbers' }),
        ).toBeInTheDocument()
    })

    it('reads in the order it looks: the note on what is in progress, the chart, the button, the table', () => {
        const { container } = renderChart({ bars: [bar([1, 2, 3])] })

        const note = container.querySelector(
            '[data-slot="time-series-chart-in-progress"]',
        )!
        const chart = screen.getByRole('img')
        const button = screen.getByRole('button')
        const table = container.querySelector('table')!
        const before = (a: Node, b: Node) =>
            Boolean(
                a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
            )

        expect(before(note, chart)).toBe(true)
        expect(before(chart, button)).toBe(true)
        expect(before(button, table)).toBe(true)
    })
})

describe('TimeSeriesChart: the table and the drawing say the same', () => {
    it('draws a bar as tall as its value, none for a value not captured, and a 0 as nothing', async () => {
        const values = [10, 20, null, 0, 5]
        const { container } = renderChart({
            bars: [bar(values)],
            buckets: hourlyBuckets(5, false),
        })

        await userEvent.click(screen.getByRole('button', { name: 'View data' }))

        const cells = within(screen.getByRole('table'))
            .getAllByRole('row')
            .slice(1)
            .map((row) => within(row).getAllByRole('cell')[0].textContent)
        const heights = barHeights(container)

        expect(cells).toEqual(['10 u', '20 u', 'Not captured', '0 u', '5 u'])
        expect(heights).toHaveLength(5)

        const tallest = Math.max(...heights)

        // A bar is as tall as its share of the tallest, and a missing value draws no height.
        values.forEach((value, index) => {
            expect(heights[index] / tallest).toBeCloseTo((value ?? 0) / 20, 5)
        })
        // The 20 reaches the top of the axis: the axis was sized from the table's numbers.
        expect(yLabels(container).at(-1)).toBe('20 u')
    })

    it('draws a line with a break at a value not captured, and the table says it in words', async () => {
        const { container } = renderChart({
            line: line([1, null, 3, 4]),
            buckets: hourlyBuckets(4, false),
        })

        await userEvent.click(screen.getByRole('button', { name: 'View data' }))

        const solid = container.querySelector('path.recharts-line-curve')!

        // Two pieces: the first point alone, and the last two joined.
        expect(solid.getAttribute('d')?.match(/M/g)).toHaveLength(2)
        // A point for each captured value, none for the missing one.
        expect(container.querySelectorAll('circle')).toHaveLength(3)
        expect(
            within(screen.getByRole('table'))
                .getAllByRole('row')
                .slice(1)
                .map((row) => within(row).getAllByRole('cell')[0].textContent),
        ).toEqual(['1 lvl', 'Not captured', '3 lvl', '4 lvl'])
    })

    it('draws a line value of 0 as a point at the baseline, not as a break', () => {
        const { container } = renderChart({
            line: line([2, 0, 2]),
            buckets: hourlyBuckets(3, false),
        })

        const circles = [...container.querySelectorAll('circle')]
        const ys = circles.map((circle) => Number(circle.getAttribute('cy')))

        expect(circles).toHaveLength(3)
        expect(ys[1]).toBeGreaterThan(ys[0])
        expect(
            container
                .querySelector('path.recharts-line-curve')
                ?.getAttribute('d')
                ?.match(/M/g),
        ).toHaveLength(1)
    })
})

describe('TimeSeriesChart: a bucket in progress', () => {
    it('dims only that bar, and says in words which bucket it is', () => {
        const { container } = renderChart({
            bars: [bar([4, 5, 6])],
            buckets: hourlyBuckets(3, true),
        })
        const bars = [
            ...container.querySelectorAll('.recharts-bar-rectangle rect'),
        ].map((rect) => rect.getAttribute('fill-opacity'))

        expect(bars).toEqual(['1', '1', '0.4'])
        expect(
            container.querySelector(
                '[data-slot="time-series-chart-in-progress"]',
            ),
        ).toHaveTextContent('In progress: Jan 5, 08:00–09:00')
    })

    it('says nothing about progress, and dims nothing, when every bucket is complete', () => {
        const { container } = renderChart({
            bars: [bar([4, 5, 6])],
            buckets: hourlyBuckets(3, false),
        })

        expect(
            container.querySelector(
                '[data-slot="time-series-chart-in-progress"]',
            ),
        ).toBeNull()
        expect(
            [...container.querySelectorAll('.recharts-bar-rectangle rect')].map(
                (rect) => rect.getAttribute('fill-opacity'),
            ),
        ).toEqual(['1', '1', '1'])
    })

    it('takes the words from the caller', () => {
        const { container } = renderChart({
            bars: [bar([4, 5])],
            buckets: hourlyBuckets(2, true),
            inProgressLabel: 'Still filling',
        })

        expect(container).toHaveTextContent('Still filling: Jan 5, 07:00')
        expect(container).not.toHaveTextContent('In progress')
    })

    it('draws the line into an in-progress bucket dashed, ending in a hollow point', () => {
        const { container } = renderChart({
            line: line([1, 2, 3]),
            buckets: hourlyBuckets(3, true),
        })
        const paths = [
            ...container.querySelectorAll('path.recharts-line-curve'),
        ]
        const solid = container.querySelectorAll('circle:not(.fill-card)')
        const hollow = container.querySelectorAll('circle.fill-card')

        expect(paths).toHaveLength(2)
        expect(paths[0]).not.toHaveAttribute('stroke-dasharray')
        expect(paths[1]).toHaveAttribute('stroke-dasharray')
        // The solid line's own points: the two complete buckets.
        expect(solid).toHaveLength(2)
        expect(hollow).toHaveLength(1)
    })

    it('draws no dashed part and no hollow point when the line is complete', () => {
        const { container } = renderChart({
            line: line([1, 2, 3]),
            buckets: hourlyBuckets(3, false),
        })

        expect(
            container.querySelectorAll('path.recharts-line-curve'),
        ).toHaveLength(1)
        expect(container.querySelectorAll('circle.fill-card')).toHaveLength(0)
        expect(container.querySelectorAll('circle')).toHaveLength(3)
    })

    it('does not draw a drop: the in-progress value is never plotted as 0', () => {
        const { container } = renderChart({
            line: line([5, 5, null]),
            buckets: hourlyBuckets(3, true),
        })

        // The last bucket has no value yet: no hollow point, no dashed part.
        expect(container.querySelectorAll('circle.fill-card')).toHaveLength(0)
        expect(container.querySelectorAll('circle')).toHaveLength(2)
    })
})

describe('TimeSeriesChart: the states', () => {
    it('shows the empty message and no chart when there are no buckets', () => {
        const { container } = renderChart({ bars: [bar([])], buckets: [] })

        expect(screen.getByText(words.emptyLabel)).toBeInTheDocument()
        expect(container.querySelector('svg')).toBeNull()
        expect(screen.queryByRole('button')).toBeNull()
    })

    it('shows the empty message when no bucket has a value', () => {
        const { container } = renderChart({ bars: [bar([null, null, null])] })

        expect(screen.getByText(words.emptyLabel)).toBeInTheDocument()
        expect(container.querySelector('svg')).toBeNull()
    })

    it('still carries the summary when it is empty, for assistive technology only', () => {
        renderChart({ bars: [bar([null])] })

        expect(screen.getByText(summary)).toHaveClass('sr-only')
    })

    it('shows the chart, not the empty message, as soon as one value exists', () => {
        const { container } = renderChart({ bars: [bar([null, 0, null])] })

        expect(screen.queryByText(words.emptyLabel)).toBeNull()
        expect(container.querySelector('svg')).not.toBeNull()
    })

    it('says every bucket is 0 only when they all are, and keeps an axis from 0 to a different number', () => {
        const { container } = renderChart({ bars: [bar([0, 0, 0])] })

        expect(screen.getByText(words.zeroLabel)).toBeInTheDocument()
        expect(container.querySelector('svg')).not.toBeNull()

        const labels = yLabels(container)

        expect(labels).toEqual(['0 u', '1 u'])
        expect(new Set(labels).size).toBe(labels.length)
        expect(container.textContent).not.toMatch(/NaN|Infinity/)
    })

    it('does not say every bucket is 0 when one is not, or when one is not captured', () => {
        const { rerender } = renderChart({ bars: [bar([0, 0, 1])] })

        expect(screen.queryByText(words.zeroLabel)).toBeNull()

        rerender(
            <TimeSeriesChart
                {...words}
                formatBucket={formatBucket}
                formatTick={formatTick}
                formatValue={formatValue}
                summary={summary}
                buckets={hourlyBuckets(3)}
                bars={[bar([0, null, 0])]}
            />,
        )

        // Zero everywhere it was captured: that is still all zero, and says so.
        expect(screen.getByText(words.zeroLabel)).toBeInTheDocument()
    })

    it('draws one bucket as one narrow bar and one label, not a block that fills the width', () => {
        const { container } = renderChart({
            bars: [bar([7])],
            buckets: hourlyBuckets(1, false),
        })
        const rect = container.querySelector('.recharts-bar-rectangle rect')!
        const plot = container.querySelector('clipPath rect')!

        expect(
            container.querySelectorAll('.recharts-bar-rectangle'),
        ).toHaveLength(1)
        expect(xLabels(container)).toEqual(['06:00'])
        expect(Number(rect.getAttribute('width'))).toBeLessThanOrEqual(48)
        expect(Number(rect.getAttribute('width'))).toBeLessThan(
            Number(plot.getAttribute('width')) / 2,
        )
    })

    it('draws one bucket of a line as one point, and the table has one row', async () => {
        const { container } = renderChart({
            line: line([3]),
            buckets: hourlyBuckets(1, false),
        })

        expect(container.querySelectorAll('circle')).toHaveLength(1)

        await userEvent.click(screen.getByRole('button', { name: 'View data' }))

        expect(screen.getAllByRole('row')).toHaveLength(2)
    })
})

describe('TimeSeriesChart: the x axis at different widths', () => {
    const values = Array.from({ length: 24 }, (_, index) => index + 1)

    it('labels every bucket when there is room', () => {
        stubWidth(3_000)

        const { container } = renderChart({ bars: [bar(values)] })

        expect(xLabels(container)).toHaveLength(24)
    })

    it('labels fewer, and always the newest, when there is not', () => {
        stubWidth(200)

        const { container } = renderChart({
            bars: [bar(values)],
            buckets: hourlyBuckets(24, false),
        })
        const labels = xLabels(container)

        expect(labels.length).toBeGreaterThan(0)
        expect(labels.length).toBeLessThan(24)
        expect(labels.at(-1)).toBe('05:00')
        expect(new Set(labels).size).toBe(labels.length)
    })

    it('labels only the newest bucket in almost no room', () => {
        stubWidth(60)

        const { container } = renderChart({
            bars: [bar(values)],
            buckets: hourlyBuckets(24, false),
        })

        expect(xLabels(container)).toEqual(['05:00'])
    })

    it('follows the container when it changes', () => {
        const values24 = Array.from({ length: 24 }, (_, index) => index + 1)
        const props = {
            ...words,
            formatBucket,
            formatTick,
            formatValue,
            summary,
            buckets: hourlyBuckets(24, false),
            bars: [bar(values24)],
        }
        const { container, rerender } = render(<TimeSeriesChart {...props} />)
        const narrow = xLabels(container).length

        stubWidth(4_000)
        rerender(<TimeSeriesChart {...props} />)

        expect(narrow).toBeLessThan(24)
        expect(xLabels(container)).toHaveLength(24)
    })
})

describe('TimeSeriesChart: the rest', () => {
    it('lists each bar series in the legend, in the caller words', () => {
        const { container } = renderChart({
            bars: [
                bar([1, 2]),
                {
                    ...bar([1, 1]),
                    key: 'beta',
                    label: 'Beta',
                    color: 'warning',
                },
            ],
        })
        const legend = container.querySelector('.recharts-legend-wrapper')!

        expect(
            within(legend as HTMLElement).getByText('Alpha'),
        ).toBeInTheDocument()
        expect(
            within(legend as HTMLElement).getByText('Beta'),
        ).toBeInTheDocument()
    })

    it('lists a line once in the legend, though a dashed part is drawn', () => {
        const { container } = renderChart({
            line: line([1, 2, 3]),
            buckets: hourlyBuckets(3, true),
        })
        const legend = container.querySelector('.recharts-legend-wrapper')!

        expect(legend.textContent).toBe('Level')
    })

    it('colours series from the tokens, as variables, with no colour value anywhere', () => {
        const { container } = renderChart({
            bars: [
                bar([1, 2]),
                { ...bar([1, 1]), key: 'beta', color: 'destructive' },
            ],
        })
        const style = container.querySelector('style')?.textContent ?? ''

        expect(style).toContain('--color-s0: var(--chart-1)')
        expect(style).toContain('--color-s1: var(--destructive)')
        // What the chart draws for a series is a variable, never a colour value.
        const drawn = container.querySelectorAll(
            '.recharts-bar-rectangle rect, .recharts-line-curve, circle',
        )

        expect(drawn.length).toBeGreaterThan(0)

        for (const element of drawn) {
            expect(
                element.getAttribute('fill') ?? element.getAttribute('stroke'),
            ).toMatch(/^var\(--/)
        }
    })

    it('draws without animation', () => {
        const { container } = renderChart({ bars: [bar([1, 2, 3])] })

        expect(
            container.querySelector('.recharts-bar-rectangle'),
        ).not.toBeNull()
        expect(container.querySelector('[class*="animat"]')).toBeNull()
    })

    it('takes a class name for the whole, and a class for the height of the chart', () => {
        const { container } = renderChart({
            bars: [bar([1])],
            className: 'extra',
            chartClassName: 'h-64',
        })

        expect(container.firstElementChild).toHaveClass('extra')
        expect(container.querySelector('[data-slot="chart"]')).toHaveClass(
            'h-64',
        )
        expect(container.querySelector('[data-slot="chart"]')).not.toHaveClass(
            'h-48',
        )
    })

    it('takes a class name when it is empty too', () => {
        const { container } = renderChart({
            bars: [bar([null])],
            className: 'extra',
        })

        expect(container.firstElementChild).toHaveClass('extra')
    })
})

describe('TimeSeriesChart: the room the x axis really has', () => {
    const values = Array.from({ length: 24 }, (_, index) => index + 1)
    // Ticks of 0, 10, 20, 30 written as "$1,000.00": nine characters, a 71 px axis.
    const long = (value: number) => `$1,${String(value).padStart(3, '0')}.00`
    const props = { formatValue: long, buckets: hourlyBuckets(24, false) }

    it('subtracts the whole y axis and the margins, so a long y label thins the x labels further', () => {
        // Labels take 47 px a slot. The plot is 142 - 71 - 16 = 55 px: room for one. Taking a flat
        // 48 px for the axis would have found 94 px and kept two.
        stubWidth(142)

        const { container } = renderChart({ ...props, bars: [bar(values)] })

        expect(xLabels(container)).toEqual(['05:00'])
    })

    it('keeps the labels a short y label leaves room for', () => {
        stubWidth(142)

        const { container } = renderChart({
            buckets: hourlyBuckets(24, false),
            bars: [bar(values)],
        })

        // "30 u" is a 36 px axis: 142 - 36 - 16 = 90 px, room for one slot of 47 and not two.
        expect(xLabels(container)).toHaveLength(1)

        stubWidth(160)
        const again = renderChart({
            buckets: hourlyBuckets(24, false),
            bars: [bar(values)],
        })

        // 160 - 36 - 16 = 108 px: two slots.
        expect(xLabels(again.container)).toHaveLength(2)
    })

    it('takes a line’s padding off the plot too', () => {
        // The axis is "6 lvl": 43 px. A bar's plot at 153 is 153 - 43 - 16 = 94 px (two slots);
        // a line's is 24 px narrower, 70 px (one slot).
        stubWidth(153)
        const small = values.map((value) => value / 5)

        const bars = renderChart({
            buckets: hourlyBuckets(24, false),
            bars: [bar(small)],
            formatValue: (value) => `${value} lvl`,
        })

        expect(xLabels(bars.container)).toHaveLength(2)

        const lines = renderChart({
            buckets: hourlyBuckets(24, false),
            line: line(small),
            formatValue: (value) => `${value} lvl`,
        })

        expect(xLabels(lines.container)).toHaveLength(1)
    })
})

describe('TimeSeriesChart: buckets that share a key', () => {
    it('draws each as its own bar, with its own tick and its own table row', async () => {
        const buckets = hourlyBuckets(2, false).map((bucket) => ({
            ...bucket,
            key: 'same',
        }))
        const { container } = renderChart({
            buckets,
            bars: [bar([3, 6])],
        })

        expect(
            container.querySelectorAll('.recharts-bar-rectangle'),
        ).toHaveLength(2)
        expect(xLabels(container)).toEqual(['06:00', '07:00'])

        await userEvent.click(screen.getByRole('button', { name: 'View data' }))

        const rows = screen.getAllByRole('row').slice(1)

        expect(rows.map((row) => row.textContent)).toEqual([
            'Jan 5, 06:00\u201307:003 u',
            'Jan 5, 07:00\u201308:006 u',
        ])
    })
})

describe('TimeSeriesChart: values that cannot be drawn', () => {
    it('treats a negative value as not captured, in the table and the drawing', async () => {
        const { container } = renderChart({
            bars: [bar([4, -2, 6])],
            buckets: hourlyBuckets(3, false),
        })

        await userEvent.click(screen.getByRole('button', { name: 'View data' }))

        expect(
            screen
                .getAllByRole('row')
                .slice(1)
                .map((row) => within(row).getAllByRole('cell')[0].textContent),
        ).toEqual(['4 u', 'Not captured', '6 u'])
        // The negative one draws no height.
        expect(barHeights(container)[1]).toBe(0)
        expect(container.textContent).not.toMatch(/-2|NaN|Infinity/)
    })

    it('shows the empty message, not a chart under a 0–1 axis, when every value is negative', () => {
        const { container } = renderChart({ bars: [bar([-1, -5, -2])] })

        expect(screen.getByText(words.emptyLabel)).toBeInTheDocument()
        expect(container.querySelector('svg')).toBeNull()
    })

    it('shows the empty message, with no Infinity on an axis, when a stack overflows', () => {
        const { container } = renderChart({
            bars: [bar([1e308, 1]), { ...bar([1e308, 1]), key: 'beta' }],
        })

        expect(screen.getByText(words.emptyLabel)).toBeInTheDocument()
        expect(container.querySelector('svg')).toBeNull()
        expect(container.textContent).not.toMatch(/Infinity|NaN/)
    })

    it('shows the empty message when the top of the axis would overflow', () => {
        renderChart({ line: line([1.7e308, 1]) })

        expect(screen.getByText(words.emptyLabel)).toBeInTheDocument()
    })

    it('still draws a large value an axis can hold', () => {
        const { container } = renderChart({ line: line([1e300, 2e300]) })

        expect(container.querySelector('svg')).not.toBeNull()
        expect(container.textContent).not.toMatch(/Infinity|NaN/)
    })
})

describe('TimeSeriesChart: the corner of the table', () => {
    it('names the bucket column with its own short label, not the summary', async () => {
        renderChart({ bars: [bar([1, 2, 3])] })

        await userEvent.click(screen.getByRole('button', { name: 'View data' }))

        const table = screen.getByRole('table', { name: summary })

        expect(
            within(table)
                .getAllByRole('columnheader')
                .map((header) => header.textContent),
        ).toEqual(['Time', 'Alpha'])
        // Once as the table's caption; the drawing's label is an attribute, not text.
        expect(screen.getAllByText(summary)).toHaveLength(1)
    })

    it('takes the column’s name from the caller', async () => {
        renderChart({ bars: [bar([1])], bucketColumnLabel: 'Hour' })

        await userEvent.click(screen.getByRole('button', { name: 'View data' }))

        expect(
            screen.getByRole('columnheader', { name: 'Hour' }),
        ).toBeInTheDocument()
        expect(screen.queryByRole('columnheader', { name: 'Time' })).toBeNull()
    })
})
