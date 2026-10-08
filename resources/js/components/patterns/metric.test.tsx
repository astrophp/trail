import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Change } from '@/components/patterns/change'
import { Metric } from '@/components/patterns/metric'
import { MetricStrip } from '@/components/patterns/metric-strip'

function renderMetric(metric: ReactNode) {
    return render(
        <MemoryRouter>
            <MetricStrip>{metric}</MetricStrip>
        </MemoryRouter>,
    )
}

function group(container: HTMLElement) {
    const found = container.querySelector('[data-slot="metric"]')

    if (found === null) {
        throw new Error('No metric rendered')
    }

    return found
}

describe('Metric', () => {
    it('is a label with its value', () => {
        const { container } = renderMetric(
            <Metric label="Traces">1,284</Metric>,
        )

        expect(screen.getByText('Traces').tagName).toBe('DT')
        expect(screen.getByText('1,284').tagName).toBe('DD')
        expect(group(container).children).toHaveLength(2)
    })

    it('draws the value as given, without formatting it', () => {
        renderMetric(
            <Metric label="Estimated cost">
                <span data-testid="value">1234567.891</span>
            </Metric>,
        )

        expect(screen.getByTestId('value')).toHaveTextContent('1234567.891')
        expect(screen.getByTestId('value').parentElement?.tagName).toBe('DD')
    })

    it('draws a value that says it was not captured, and no change of its own', () => {
        const { container } = renderMetric(
            <Metric label="p95 duration">
                <span className="text-muted-foreground">Not captured</span>
            </Metric>,
        )

        expect(screen.getByText('Not captured')).toBeInTheDocument()
        expect(container.querySelector('[data-slot="change"]')).toBeNull()
        expect(group(container).querySelectorAll('dd')).toHaveLength(1)
    })

    it('puts the label, value, change and detail in that order', () => {
        const { container } = renderMetric(
            <Metric
                label="Failed"
                change={<span>change text</span>}
                detail="detail text"
            >
                value text
            </Metric>,
        )

        expect(
            Array.from(group(container).children).map((child) => [
                child.tagName,
                child.textContent,
            ]),
        ).toEqual([
            ['DT', 'Failed'],
            ['DD', 'value text'],
            ['DD', 'change text'],
            ['DD', 'detail text'],
        ])
    })

    it('leaves out a change and a detail it is not given', () => {
        const { container, rerender } = renderMetric(
            <Metric label="Failed" detail="27 failed">
                27
            </Metric>,
        )

        expect(
            Array.from(group(container).children).map((c) => c.textContent),
        ).toEqual(['Failed', '27', '27 failed'])

        rerender(
            <MemoryRouter>
                <MetricStrip>
                    <Metric label="Failed" change={<span>+5%</span>}>
                        27
                    </Metric>
                </MetricStrip>
            </MemoryRouter>,
        )

        expect(
            Array.from(group(container).children).map((c) => c.textContent),
        ).toEqual(['Failed', '27', '+5%'])
    })

    it('has no link without a target', () => {
        renderMetric(<Metric label="Failed">27</Metric>)

        expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    it('has one link, named by its label and described by its value, when it has a target', () => {
        const { container } = renderMetric(
            <Metric
                label="Failed"
                to="/traces?status=failed"
                change={<span>+5%</span>}
                detail="2.1% of runs"
            >
                27
            </Metric>,
        )

        const link = screen.getByRole('link', { name: 'Failed' })

        expect(screen.getAllByRole('link')).toHaveLength(1)
        expect(link).toHaveAttribute('href', '/traces?status=failed')
        expect(link).toHaveAccessibleDescription('27')
        expect(group(container).contains(link)).toBe(true)
        expect(link.parentElement?.tagName).toBe('DT')
    })

    it('takes a class name', () => {
        const { container } = renderMetric(
            <Metric label="Failed" className="extra">
                27
            </Metric>,
        )

        expect(group(container)).toHaveClass('extra')
    })

    it('hides the wrapper of a change that renders nothing, and not one that renders', () => {
        const { container, rerender } = renderMetric(
            <Metric
                label="Failed"
                change={
                    <Change
                        mode="relative"
                        polarity="neutral"
                        current={null}
                        previous={4}
                    />
                }
            >
                27
            </Metric>,
        )

        const emptied = Array.from(group(container).querySelectorAll('dd'))

        expect(emptied).toHaveLength(2)
        expect(emptied[1]).toBeEmptyDOMElement()
        expect(emptied[1]).toHaveClass('empty:hidden')

        rerender(
            <MemoryRouter>
                <MetricStrip>
                    <Metric
                        label="Failed"
                        change={
                            <Change
                                mode="relative"
                                polarity="neutral"
                                current={5}
                                previous={4}
                            />
                        }
                    >
                        27
                    </Metric>
                </MetricStrip>
            </MemoryRouter>,
        )

        const filled = Array.from(group(container).querySelectorAll('dd'))

        expect(filled[1]).not.toBeEmptyDOMElement()
        expect(filled[1]).toHaveTextContent('+25.0%')
    })
})
