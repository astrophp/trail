import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
    barSeries,
    formatBucket,
    formatTick,
    formatValue,
    hourlyBuckets,
} from '@/components/patterns/time-series-chart-fixtures'
import { buildChartModel } from '@/components/patterns/time-series-chart-model'
import { TimeSeriesChartTooltip } from '@/components/patterns/time-series-chart-tooltip'

const model = buildChartModel({
    buckets: hourlyBuckets(8),
    series: barSeries(),
    stacked: true,
    formatBucket,
    formatTick,
})

function renderTooltip(
    props: Partial<Parameters<typeof TimeSeriesChartTooltip>[0]> = {},
) {
    return render(
        <TimeSeriesChartTooltip
            model={model}
            bucketKey="b3"
            missingLabel="Not captured"
            inProgressLabel="In progress"
            formatValue={formatValue}
            {...props}
        />,
    )
}

describe('TimeSeriesChartTooltip', () => {
    it('names the bucket with the caller label and lists every series with its value', () => {
        const { container } = renderTooltip()

        expect(container).toHaveTextContent('Jan 5, 09:00–10:00')
        expect(container).toHaveTextContent('Alpha')
        expect(container).toHaveTextContent('22 u')
        expect(container).toHaveTextContent('Beta')
        expect(container).toHaveTextContent('3 u')
        expect(container).toHaveTextContent('2 u')
    })

    it('says a value was not captured in words, and does not write a 0 for it', () => {
        const { container } = renderTooltip({ bucketKey: 'b5' })
        const rows = container.querySelectorAll('.flex.items-center')

        expect(rows[1]).toHaveTextContent('Beta')
        expect(rows[1]).toHaveTextContent('Not captured')
        expect(rows[1]).not.toHaveTextContent('0 u')
        // A value that is 0 is written as 0.
        expect(rows[2]).toHaveTextContent('0 u')
        expect(rows[2]).not.toHaveTextContent('Not captured')
    })

    it('marks a bucket in progress, and only that one', () => {
        const { container, rerender } = renderTooltip({ bucketKey: 'b7' })

        expect(container).toHaveTextContent('(In progress)')

        rerender(
            <TimeSeriesChartTooltip
                model={model}
                bucketKey="b6"
                missingLabel="Not captured"
                inProgressLabel="In progress"
                formatValue={formatValue}
            />,
        )

        expect(container).not.toHaveTextContent('In progress')
    })

    it('draws nothing when it is not active, or the bucket is not known', () => {
        const { container, rerender } = renderTooltip({ active: false })

        expect(container).toBeEmptyDOMElement()

        rerender(
            <TimeSeriesChartTooltip
                model={model}
                bucketKey="nope"
                missingLabel="Not captured"
                inProgressLabel="In progress"
                formatValue={formatValue}
            />,
        )

        expect(container).toBeEmptyDOMElement()

        rerender(
            <TimeSeriesChartTooltip
                model={model}
                bucketKey={undefined}
                missingLabel="Not captured"
                inProgressLabel="In progress"
                formatValue={formatValue}
            />,
        )

        expect(container).toBeEmptyDOMElement()
    })

    it('colours each swatch from its token, as a variable', () => {
        const { container } = renderTooltip()
        const swatches = container.querySelectorAll<HTMLElement>(
            '[aria-hidden="true"]',
        )

        expect(
            [...swatches].map((swatch) => swatch.style.backgroundColor),
        ).toEqual(['var(--chart-1)', 'var(--destructive)', 'var(--warning)'])
    })

    it('takes a class name', () => {
        renderTooltip({ className: 'extra' })

        expect(
            document.querySelector('[data-slot="time-series-chart-tooltip"]'),
        ).toHaveClass('extra')
        expect(screen.queryByRole('alert')).toBeNull()
    })
})
