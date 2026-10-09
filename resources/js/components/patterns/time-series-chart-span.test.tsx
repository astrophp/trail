import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
    formatBucket,
    formatTick,
    formatValue,
    hourlyBuckets,
} from '@/components/patterns/time-series-chart-fixtures'
import {
    buildChartModel,
    type ChartSeries,
} from '@/components/patterns/time-series-chart-model'
import { TimeSeriesChartTable } from '@/components/patterns/time-series-chart-table'
import { TimeSeriesChartTooltip } from '@/components/patterns/time-series-chart-tooltip'

// What a series' `span` does to the model, the tooltip and the table.

const one = (
    values: (number | null)[],
    span?: ChartSeries['span'],
): ChartSeries => ({
    key: 'level',
    label: 'Level',
    color: 'chart-1',
    values,
    span,
})

const build = (series: ChartSeries[], count = series[0]?.values.length ?? 0) =>
    buildChartModel({
        buckets: hourlyBuckets(count, false),
        series,
        stacked: false,
        formatBucket,
        formatTick,
    })

describe('buildChartModel: a series with a span', () => {
    it('speaks for every bucket without one', () => {
        const { rows } = build([one([1, 2, 3, 4])])

        expect(rows.map((row) => row.applies)).toEqual([
            [true],
            [true],
            [true],
            [true],
        ])
        expect(rows.map((row) => row.values[0])).toEqual([1, 2, 3, 4])
    })

    it('has no value, and says nothing, outside it, and speaks at both of its ends', () => {
        const { rows } = build([one([1, 2, 3, 4], { from: 1, to: 2 })])

        expect(rows.map((row) => row.applies[0])).toEqual([
            false,
            true,
            true,
            false,
        ])
        expect(rows.map((row) => row.values[0])).toEqual([null, 2, 3, null])
    })

    it('takes an open end as the edge of the buckets', () => {
        expect(
            build([one([1, 2, 3, 4], { from: 2 })]).rows.map(
                (row) => row.values[0],
            ),
        ).toEqual([null, null, 3, 4])
        expect(
            build([one([1, 2, 3, 4], { to: 0 })]).rows.map(
                (row) => row.values[0],
            ),
        ).toEqual([1, null, null, null])
    })

    it('keeps a value that was not captured, inside the span, as one that speaks', () => {
        const { rows } = build([one([1, null, 3], { to: 2 })])

        expect(rows.map((row) => row.applies[0])).toEqual([true, true, true])
        expect(rows.map((row) => row.values[0])).toEqual([1, null, 3])
    })

    it('does not let a value outside the span set the axis', () => {
        expect(build([one([100, 3], { from: 1 })]).axis.top).toBeLessThan(100)
    })
})

const recorded = one([1, 2, null, null], { to: 1 })
const projected: ChartSeries = {
    key: 'projected',
    label: 'Projected',
    color: 'chart-4',
    values: [null, 2, 3, 4],
    span: { from: 1 },
}

describe('TimeSeriesChartTooltip: a series with a span', () => {
    const model = build([recorded, projected])
    const tooltip = (bucketIndex: number) => (
        <TimeSeriesChartTooltip
            model={model}
            bucketIndex={bucketIndex}
            missingLabel="Not captured"
            inProgressLabel="In progress"
            formatValue={formatValue}
        />
    )

    it('has no row for a series that has nothing to say about the bucket', () => {
        const { container, rerender } = render(tooltip(0))

        expect(container).toHaveTextContent('Level')
        expect(container).not.toHaveTextContent('Projected')

        rerender(tooltip(3))

        expect(container).toHaveTextContent('Projected')
        expect(container).toHaveTextContent('4 u')
        expect(container).not.toHaveTextContent('Level')
        expect(container).not.toHaveTextContent('Not captured')
    })

    it('has both rows where the spans meet', () => {
        const { container } = render(tooltip(1))

        expect(container).toHaveTextContent('Level')
        expect(container).toHaveTextContent('Projected')
    })
})

describe('TimeSeriesChartTable: a series with a span', () => {
    it('leaves a cell empty where the series has nothing to say, and says it was not captured only where a value is missing', () => {
        render(
            <TimeSeriesChartTable
                model={build([one([1, null, null], { to: 1 })])}
                caption="Spanned."
                bucketColumnLabel="Time"
                missingLabel="Not captured"
                inProgressLabel="In progress"
                formatValue={formatValue}
            />,
        )

        expect(
            screen
                .getAllByRole('row')
                .slice(1)
                .map((row) => within(row).getByRole('cell').textContent),
        ).toEqual(['1 lvl', 'Not captured', ''])
    })
})
