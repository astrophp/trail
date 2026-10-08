import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Metric } from '@/components/patterns/metric'
import { MetricStrip } from '@/components/patterns/metric-strip'

const labels = ['Traces', 'Failed', 'Cost', 'Duration', 'Conversations']

describe('MetricStrip', () => {
    it.each([4, 5])(
        'renders its %s metrics as the groups of one description list',
        (count) => {
            const { container } = render(
                <MetricStrip>
                    {labels.slice(0, count).map((label) => (
                        <Metric key={label} label={label}>
                            1
                        </Metric>
                    ))}
                </MetricStrip>,
            )

            const list = container.querySelector('dl')

            expect(list?.children).toHaveLength(count)
            expect(list?.querySelectorAll('[data-slot="metric"]')).toHaveLength(
                count,
            )
            expect(
                Array.from(list?.querySelectorAll('dt') ?? []).map(
                    (dt) => dt.textContent,
                ),
            ).toEqual(labels.slice(0, count))
        },
    )

    it('takes a class name', () => {
        const { container } = render(
            <MetricStrip className="extra">
                <Metric label="Traces">1</Metric>
            </MetricStrip>,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
