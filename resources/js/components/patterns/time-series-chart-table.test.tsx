import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
    barSeries,
    formatBucket,
    formatTick,
    formatValue,
    hourlyBuckets,
} from '@/components/patterns/time-series-chart-fixtures'
import { buildChartModel } from '@/components/patterns/time-series-chart-model'
import { TimeSeriesChartTable } from '@/components/patterns/time-series-chart-table'

const model = buildChartModel({
    buckets: hourlyBuckets(8),
    series: barSeries(),
    stacked: true,
    formatBucket,
    formatTick,
})

function renderTable(className?: string) {
    return render(
        <TimeSeriesChartTable
            model={model}
            caption="Three series over eight hours."
            missingLabel="Not captured"
            inProgressLabel="In progress"
            formatValue={formatValue}
            className={className}
        />,
    )
}

describe('TimeSeriesChartTable', () => {
    it('is a table with a caption, a column per series and a row per bucket', () => {
        renderTable()

        const table = screen.getByRole('table', {
            name: 'Three series over eight hours.',
        })
        const headers = within(table).getAllByRole('columnheader')

        expect(headers.map((header) => header.textContent)).toEqual([
            'Three series over eight hours.',
            'Alpha',
            'Beta',
            'Gamma',
        ])
        // The header row and eight buckets.
        expect(within(table).getAllByRole('row')).toHaveLength(9)
    })

    it('names each row by its bucket, as the caller labelled it', () => {
        renderTable()

        const rowHeaders = screen.getAllByRole('rowheader')

        expect(rowHeaders[0]).toHaveTextContent('Jan 5, 06:00–07:00')
        expect(rowHeaders[3]).toHaveTextContent('Jan 5, 09:00–10:00')
    })

    it('writes each value through the caller, with a 0 as 0', () => {
        renderTable()

        const row = screen.getAllByRole('row')[4]

        // 09:00 bucket: alpha 22, beta 3, gamma 2.
        expect(
            within(row)
                .getAllByRole('cell')
                .map((cell) => cell.textContent),
        ).toEqual(['22 u', '3 u', '2 u'])
        expect(
            within(screen.getAllByRole('row')[3])
                .getAllByRole('cell')
                .map((cell) => cell.textContent),
        ).toEqual(['9 u', '0 u', '0 u'])
    })

    it('says a value that was not captured in the caller words, and never writes it as 0', () => {
        renderTable()

        // 11:00 bucket: beta not captured.
        const cells = within(screen.getAllByRole('row')[6]).getAllByRole('cell')

        expect(cells.map((cell) => cell.textContent)).toEqual([
            '25 u',
            'Not captured',
            '0 u',
        ])
    })

    it('marks only the bucket in progress, in words', () => {
        renderTable()

        const rowHeaders = screen.getAllByRole('rowheader')

        expect(rowHeaders[7]).toHaveTextContent('(In progress)')
        expect(
            rowHeaders.filter((header) =>
                header.textContent?.includes('In progress'),
            ),
        ).toHaveLength(1)
    })

    it('takes a class name', () => {
        renderTable('extra')

        expect(screen.getByRole('table')).toHaveClass('extra')
    })
})
