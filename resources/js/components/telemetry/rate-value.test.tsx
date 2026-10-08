import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RateValue } from '@/components/telemetry/rate-value'

describe('RateValue', () => {
    it.each<[number, string]>([
        [0.0357142857, '3.6%'],
        [0.5, '50.0%'],
        [1, '100.0%'],
        [0, '0.0%'],
        [0.0002, '<0.1%'],
        [0.9996, '>99.9%'],
    ])('shows %s as %s', (rate, text) => {
        render(<RateValue rate={rate} />)

        expect(screen.getByText(text)).toBeInTheDocument()
    })

    it('says there are no finished runs for null, with no digit', () => {
        const { container } = render(<RateValue rate={null} />)

        expect(screen.getByText('No finished runs')).toBeInTheDocument()
        expect(container.textContent).not.toMatch(/\d/)
    })

    it('accepts a className in both states', () => {
        const { container, rerender } = render(
            <RateValue rate={0.1} className="extra" />,
        )

        expect(container.firstElementChild).toHaveClass('extra')

        rerender(<RateValue rate={null} className="extra" />)

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
