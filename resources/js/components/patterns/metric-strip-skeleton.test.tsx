import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MetricStripSkeleton } from '@/components/patterns/metric-strip-skeleton'

describe('MetricStripSkeleton', () => {
    it.each([0, 4, 5])('draws %s cells', (count) => {
        const { container } = render(<MetricStripSkeleton count={count} />)

        expect(
            container.querySelectorAll('[data-slot="metric-skeleton"]'),
        ).toHaveLength(count)
    })

    it('is busy, and says so in words', () => {
        const { container } = render(<MetricStripSkeleton count={4} />)

        expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
        expect(screen.getByText('Loading')).toHaveClass('sr-only')
    })

    it('takes a class name', () => {
        const { container } = render(
            <MetricStripSkeleton count={4} className="extra" />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
