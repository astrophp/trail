import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PriceRate } from '@/components/telemetry/price-rate'

describe('PriceRate', () => {
    it('shows a rate as the number it is', () => {
        render(<PriceRate rate={3.75} />)

        expect(screen.getByText('3.75')).toBeVisible()
    })

    it('shows a free rate as 0', () => {
        const { container } = render(<PriceRate rate={0} />)

        expect(container).toHaveTextContent(/^0$/)
        expect(screen.queryByText('No rate')).not.toBeInTheDocument()
    })

    it('shows no rate as a dash that assistive technology reads as "No rate", never as 0', () => {
        const { container } = render(<PriceRate rate={null} />)

        expect(screen.getByText('—')).toBeVisible()
        expect(screen.getByText('No rate')).toBeInTheDocument()
        expect(container).not.toHaveTextContent('0')
    })

    it('does not round a rate to fewer decimals than the API keeps', () => {
        render(<PriceRate rate={0.000001} />)

        expect(screen.getByText('0.000001')).toBeVisible()
    })

    it('takes a class name', () => {
        const { container } = render(<PriceRate rate={1} className="x" />)

        expect(container.firstElementChild).toHaveClass('x')
    })
})
