import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TimeSeriesChart } from '@/components/patterns/time-series-chart'
import {
    formatBucket,
    formatTick,
    formatValue,
    hourlyBuckets,
    words,
} from '@/components/patterns/time-series-chart-fixtures'
import type {
    ChartBucket,
    ChartSeries,
} from '@/components/patterns/time-series-chart-model'

// jsdom cannot hover a Recharts chart (it measures every element as 0 × 0), so the tooltip
// element the chart configures is rendered with the props Recharts passed to it in the browser
// (captured from the catalogue: `active`, `label` as the row's position, `activeIndex` as a
// string, and a `payload` that may be empty). Everything else in the chart is the real one.
const hover = vi.hoisted(() => ({
    props: {},
}))

vi.mock('@/components/ui/chart', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('@/components/ui/chart')>()

    return {
        ...actual,
        ChartTooltip: ({
            content,
        }: {
            content: (props: Record<string, unknown>) => ReactNode
        }) => <foreignObject>{content(hover.props)}</foreignObject>,
    }
})

const series = (values: (number | null)[]): ChartSeries => ({
    key: 'level',
    label: 'Level',
    color: 'chart-2',
    values,
})

function renderChart(
    props: {
        buckets?: ChartBucket[]
        line?: ChartSeries
    } = {},
) {
    return render(
        <TimeSeriesChart
            {...words}
            formatBucket={formatBucket}
            formatTick={formatTick}
            formatValue={formatValue}
            summary="A level over four hours."
            buckets={props.buckets ?? hourlyBuckets(4, true)}
            line={props.line ?? series([1, null, 3, 4])}
        />,
    )
}

const tooltip = (container: HTMLElement) =>
    container.querySelector('[data-slot="time-series-chart-tooltip"]')

describe('the chart wires Recharts’ tooltip to its own content', () => {
    beforeEach(() => {
        hover.props = {}
    })

    it('shows nothing while the pointer is away', () => {
        hover.props = { active: false, activeIndex: null, payload: [] }

        const { container } = renderChart()

        expect(tooltip(container)).toBeNull()
    })

    it('names the bucket under the pointer with the caller’s label, and writes its value through the caller', () => {
        hover.props = {
            active: true,
            label: 3,
            activeIndex: '3',
            payload: [{ dataKey: 's0', value: 4 }],
        }

        const { container } = renderChart()
        const shown = tooltip(container)

        expect(shown).toHaveTextContent('Jan 5, 09:00–10:00')
        expect(shown).toHaveTextContent('Level')
        expect(shown).toHaveTextContent('4 lvl')
    })

    it('says a value was not captured, even though Recharts sends no payload for it', () => {
        hover.props = { active: true, label: 1, activeIndex: '1', payload: [] }

        const { container } = renderChart()
        const shown = tooltip(container)

        expect(shown).toHaveTextContent('Jan 5, 07:00–08:00')
        expect(shown).toHaveTextContent('Not captured')
        expect(shown).not.toHaveTextContent('lvl')
    })

    it('shows the in-progress value with the in-progress note, though only the dashed series has a payload there', () => {
        hover.props = {
            active: true,
            label: 3,
            activeIndex: '3',
            payload: [{ dataKey: 's0-pending', value: 4 }],
        }

        const { container } = renderChart({
            buckets: hourlyBuckets(4, true),
            line: series([1, 2, 3, 4]),
        })
        const shown = tooltip(container)

        expect(shown).toHaveTextContent('(In progress)')
        expect(shown).toHaveTextContent('4 lvl')
    })

    it('does not mark a complete bucket as in progress', () => {
        hover.props = {
            active: true,
            label: 0,
            activeIndex: '0',
            payload: [{ dataKey: 's0', value: 1 }],
        }

        const { container } = renderChart()

        expect(tooltip(container)).not.toHaveTextContent('In progress')
    })

    it('tells two buckets with one key apart, by position', () => {
        const buckets = hourlyBuckets(2, false).map((bucket) => ({
            ...bucket,
            key: 'same',
        }))

        hover.props = { active: true, label: 1, activeIndex: '1', payload: [] }

        const { container } = renderChart({
            buckets,
            line: series([5, 6]),
        })

        expect(tooltip(container)).toHaveTextContent('Jan 5, 07:00–08:00')
        expect(tooltip(container)).toHaveTextContent('6 lvl')
    })
})
