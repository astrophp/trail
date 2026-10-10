import { render } from '@testing-library/react'
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

// Here the width hook is the real one. jsdom measures nothing, so a ResizeObserver reports a
// size for whatever it is asked to watch, with a height too, because Recharts needs both.

const watched = new Set<Element>()

function stubObserver(width: number) {
    watched.clear()
    vi.stubGlobal(
        'ResizeObserver',
        class {
            private mine = new Set<Element>()

            constructor(private callback: (entries: unknown[]) => void) {}
            observe(element: Element) {
                this.mine.add(element)
                watched.add(element)
                this.callback([{ contentRect: { width, height: 200 } }])
            }
            disconnect() {
                for (const element of this.mine) {
                    watched.delete(element)
                }
            }
        },
    )
}

afterEach(() => {
    vi.unstubAllGlobals()
})

const bar = (values: (number | null)[]): ChartSeries => ({
    key: 'alpha',
    label: 'Alpha',
    color: 'chart-1',
    values,
})

const props = (values: (number | null)[]) => ({
    ...words,
    formatBucket,
    formatTick,
    formatValue,
    summary: 'A series over a day.',
    buckets: hourlyBuckets(values.length, false),
    bars: [bar(values)],
})

const xLabels = (container: HTMLElement) =>
    [
        ...container.querySelectorAll(
            '.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value',
        ),
    ].map((label) => label.textContent)

describe('TimeSeriesChart measures its container', () => {
    const empty = Array<null>(24).fill(null)
    const data = Array.from({ length: 24 }, (_, index) => index + 1)

    it('observes the drawing when it first renders empty and data arrives later', () => {
        stubObserver(200)

        const { container, rerender } = render(
            <TimeSeriesChart {...props(empty)} />,
        )

        expect(container.querySelector('svg')).toBeNull()

        rerender(<TimeSeriesChart {...props(data)} />)

        expect(watched.has(imageOf(container))).toBe(true)
    })

    it('thins the x labels to the width it measured after that, not to the width it started with', () => {
        stubObserver(100)

        const { container, rerender } = render(
            <TimeSeriesChart {...props(empty)} />,
        )

        rerender(<TimeSeriesChart {...props(data)} />)

        // Almost no room: only the newest. Left at the initial 320 px there would be several.
        expect(xLabels(container)).toEqual(['05:00'])
    })

    it('stops observing the drawing when it goes back to empty', () => {
        stubObserver(200)

        const { container, rerender } = render(
            <TimeSeriesChart {...props(data)} />,
        )
        const image = imageOf(container)

        expect(watched.has(image)).toBe(true)

        rerender(<TimeSeriesChart {...props(empty)} />)

        expect(watched.has(image)).toBe(false)
    })
})

function imageOf(container: HTMLElement): Element {
    const image = container.querySelector('[role="img"]')

    if (!image) {
        throw new Error('The chart is not drawn')
    }

    return image
}
