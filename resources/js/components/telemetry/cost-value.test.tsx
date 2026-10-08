import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Cost, SpanCost } from '@/api/types'
import { CostValue } from '@/components/telemetry/cost-value'

describe('CostValue', () => {
    it('shows an estimated amount', () => {
        render(<CostValue cost={{ state: 'estimated', amount: 0.0466 }} />)

        expect(screen.getByText('$0.0466')).toBeInTheDocument()
    })

    it('shows a real zero as $0.00', () => {
        render(<CostValue cost={{ state: 'estimated', amount: 0 }} />)

        expect(screen.getByText('$0.00')).toBeInTheDocument()
    })

    it('shows a partial amount with a visible marker and an explanation', () => {
        render(<CostValue cost={{ state: 'partial', amount: 0.0123 }} />)

        expect(screen.getByText('$0.0123')).toBeInTheDocument()
        expect(screen.getByText(/^Partial/)).toBeInTheDocument()
        expect(
            screen.getByText(/covers only the steps that could be priced/),
        ).toBeInTheDocument()
    })

    it('shows Unpriced', () => {
        render(<CostValue cost={{ state: 'unpriced', amount: null }} />)

        expect(screen.getByText('Unpriced')).toBeInTheDocument()
    })

    it('shows Pending', () => {
        render(<CostValue cost={{ state: 'pending', amount: null }} />)

        expect(screen.getByText('Pending')).toBeInTheDocument()
    })

    it('shows Not captured', () => {
        render(<CostValue cost={{ state: 'not_captured', amount: null }} />)

        expect(screen.getByText('Not captured')).toBeInTheDocument()
    })

    it.each<[string, Cost]>([
        ['unpriced', { state: 'unpriced', amount: null }],
        ['pending', { state: 'pending', amount: null }],
        ['pending with an amount so far', { state: 'pending', amount: 0.0123 }],
        ['not_captured', { state: 'not_captured', amount: null }],
    ])('renders no digit at all for %s', (_name, cost) => {
        const { container } = render(<CostValue cost={cost} />)

        expect(container.textContent).not.toMatch(/\d/)
        expect(container.textContent).not.toContain('$')
    })

    it("shows a span's estimated cost", () => {
        const span: SpanCost = { state: 'estimated', amount: 0.0012 }

        render(<CostValue cost={span} />)

        expect(screen.getByText('$0.0012')).toBeInTheDocument()
    })

    it("shows a span's unpriced cost as Unpriced, with no amount", () => {
        const span: SpanCost = { state: 'unpriced', amount: null }
        const { container } = render(<CostValue cost={span} />)

        expect(screen.getByText('Unpriced')).toBeInTheDocument()
        expect(container.textContent).not.toMatch(/\d|\$/)
    })

    it.each<Cost>([
        { state: 'estimated', amount: 1 },
        { state: 'partial', amount: 1 },
        { state: 'unpriced', amount: null },
        { state: 'pending', amount: null },
        { state: 'not_captured', amount: null },
    ])('accepts a className for $state', (cost) => {
        const { container } = render(
            <CostValue cost={cost} className="extra" />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
