import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TimeSeriesChart } from '@/components/patterns/time-series-chart'
import {
    formatBucket,
    formatTick,
    formatValue,
    hourlyBuckets,
    words,
} from '@/components/patterns/time-series-chart-fixtures'
import type { ChartSeries } from '@/components/patterns/time-series-chart-model'

// jsdom measures nothing: the chart believes its container is this wide.
vi.mock('@/hooks/use-element-width', () => ({
    useElementWidth: () => [() => {}, 320],
}))

const summary = 'An invented series over a few hours.'

type Props = ComponentProps<typeof TimeSeriesChart>

function renderChart(
    props: Partial<Props> & { line?: ChartSeries; bars?: ChartSeries[] },
) {
    const all = {
        ...words,
        formatBucket,
        formatTick,
        formatValue,
        summary,
        buckets: hourlyBuckets(5, false),
        ...props,
    } as Props

    return render(<TimeSeriesChart {...all} />)
}

const solid = (values: (number | null)[]): ChartSeries => ({
    key: 'level',
    label: 'Level',
    color: 'chart-2',
    values,
    span: { to: 2 },
})

const dashed = (values: (number | null)[]): ChartSeries => ({
    key: 'projected',
    label: 'Projected',
    color: 'chart-4',
    values,
    span: { from: 2 },
})

const recorded = () => solid([1, 2, 3, null, null])
const projected = () => dashed([null, null, 3, 4, 5])

const yLabels = (container: HTMLElement) =>
    [
        ...container.querySelectorAll(
            '.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value',
        ),
    ].map((label) => label.textContent)

const curves = (container: HTMLElement) => [
    ...container.querySelectorAll('path.recharts-line-curve'),
]

/** Where the labels of the x axis stand, bucket by bucket. */
const tickXs = (container: HTMLElement) =>
    [
        ...container.querySelectorAll(
            '.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value',
        ),
    ].map((tick) => Number(tick.getAttribute('x')))

describe('TimeSeriesChart: a second, dashed line', () => {
    it('draws it dashed and without points beside the solid line, and lists both in the legend', () => {
        const { container } = renderChart({
            line: recorded(),
            dashedLine: projected(),
        })
        const [first, second] = curves(container)

        expect(curves(container)).toHaveLength(2)
        expect(first).not.toHaveAttribute('stroke-dasharray')
        expect(second).toHaveAttribute('stroke-dasharray')
        expect(second).toHaveAttribute('stroke', 'var(--color-s1)')
        // The solid line's three points, and none for the dashed one.
        expect(container.querySelectorAll('circle')).toHaveLength(3)
        expect(
            container.querySelector('.recharts-legend-wrapper')?.textContent,
        ).toBe('LevelProjected')
    })

    it('leaves a break where the dashed line has no value, never a drop to 0', () => {
        const { container } = renderChart({
            line: recorded(),
            dashedLine: dashed([null, null, 3, null, 5]),
        })

        // Two pieces: the point at 3 alone and the point at 5 alone.
        expect(
            curves(container)[1]?.getAttribute('d')?.match(/M/g),
        ).toHaveLength(2)
    })

    it('sets the axis from both lines', () => {
        const { container } = renderChart({
            line: recorded(),
            dashedLine: dashed([null, null, 3, 4, 40]),
        })

        expect(yLabels(container).at(-1)).toBe('40 lvl')
    })

    it('does not let a value given outside the span set the axis', () => {
        const { container } = renderChart({
            line: recorded(),
            dashedLine: dashed([90, 90, 3, 4, 5]),
        })

        // The same axis as without the 90s: it ends at the first round number over 5.
        expect(yLabels(container).at(-1)).toBe('6 lvl')
    })

    it('puts a column for it in the table, empty where it has nothing to say', async () => {
        renderChart({ line: recorded(), dashedLine: projected() })

        await userEvent.click(screen.getByRole('button', { name: 'View data' }))

        const rows = within(screen.getByRole('table'))
            .getAllByRole('row')
            .slice(1)
            .map((row) =>
                within(row)
                    .getAllByRole('cell')
                    .map((cell) => cell.textContent),
            )

        expect(rows).toEqual([
            ['1 lvl', ''],
            ['2 lvl', ''],
            ['3 lvl', '3 u'],
            ['', '4 u'],
            ['', '5 u'],
        ])
    })
})

describe('TimeSeriesChart: a divider and a shaded region', () => {
    it('draws a vertical divider over the bucket asked for, with its label', () => {
        const { container } = renderChart({
            line: recorded(),
            dashedLine: projected(),
            divider: { at: 2, label: 'Now' },
        })
        const stroke = container.querySelector('.recharts-reference-line line')!

        expect(
            container.querySelectorAll('.recharts-reference-line'),
        ).toHaveLength(1)
        // The label is drawn in a layer of its own, above the plot.
        expect(within(container).getByText('Now')).toBeInTheDocument()
        expect(stroke.getAttribute('x1')).toBe(stroke.getAttribute('x2'))
        // It stands over the third bucket: where that bucket's label is.
        expect(Number(stroke.getAttribute('x1'))).toBeCloseTo(
            tickXs(container)[2] ?? Number.NaN,
            0,
        )
        expect(stroke.getAttribute('stroke')).toMatch(/^var\(--/)
    })

    it('shades from the bucket asked for to the last one', () => {
        const { container } = renderChart({
            line: recorded(),
            dashedLine: projected(),
            shadeFrom: 2,
        })
        const area = container.querySelector('.recharts-reference-area-rect')!
        const x = Number(area.getAttribute('x'))
        const right = x + Number(area.getAttribute('width'))
        const ticks = tickXs(container)

        expect(
            container.querySelectorAll('.recharts-reference-area'),
        ).toHaveLength(1)
        expect(x).toBeCloseTo(ticks[2] ?? Number.NaN, 0)
        expect(right).toBeCloseTo(ticks[4] ?? Number.NaN, 0)
        expect(area.getAttribute('fill')).toMatch(/^var\(--/)
    })

    it('draws no region when nothing comes after the bucket it starts at', () => {
        const { container } = renderChart({
            line: recorded(),
            shadeFrom: 4,
        })

        // The line is there, so the absence is the region's own.
        expect(curves(container)).toHaveLength(1)
        expect(container.querySelector('.recharts-reference-area')).toBeNull()
    })

    it('draws neither unless asked: a chart without them has none, and one line', () => {
        const { container } = renderChart({
            line: { ...recorded(), span: undefined },
        })

        expect(curves(container)).toHaveLength(1)
        expect(container.querySelector('.recharts-reference-line')).toBeNull()
        expect(container.querySelector('.recharts-reference-area')).toBeNull()
        expect(
            container.querySelector('.recharts-legend-wrapper')?.textContent,
        ).toBe('Level')
    })

    it('works over bars too', () => {
        const { container } = renderChart({
            bars: [
                {
                    key: 'a',
                    label: 'A',
                    color: 'chart-1',
                    values: [1, 2, 3, 4, 5],
                },
            ],
            divider: { at: 1, label: 'Deploy' },
            shadeFrom: 3,
        })

        expect(
            container.querySelectorAll('.recharts-reference-line'),
        ).toHaveLength(1)
        expect(within(container).getByText('Deploy')).toBeInTheDocument()
        expect(
            container.querySelectorAll('.recharts-reference-area'),
        ).toHaveLength(1)
    })
})

describe('TimeSeriesChart: the table asked for', () => {
    it('shows the caller’s table behind the button in place of the default one', async () => {
        renderChart({
            line: recorded(),
            table: (
                <table>
                    <caption>The caller’s own table</caption>
                    <tbody>
                        <tr>
                            <td>custom</td>
                        </tr>
                    </tbody>
                </table>
            ),
        })

        expect(screen.queryByRole('table')).toBeNull()

        await userEvent.click(screen.getByRole('button', { name: 'View data' }))

        expect(
            screen.getByRole('table', { name: 'The caller’s own table' }),
        ).toBeInTheDocument()
        expect(screen.getAllByRole('table')).toHaveLength(1)
        expect(screen.queryByRole('columnheader', { name: 'Level' })).toBeNull()
    })

    it('still shows the default table when none is asked for', async () => {
        renderChart({ line: recorded() })

        await userEvent.click(screen.getByRole('button', { name: 'View data' }))

        expect(screen.getByRole('table', { name: summary })).toBeInTheDocument()
    })
})
