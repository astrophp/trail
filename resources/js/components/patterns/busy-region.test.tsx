import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BusyRegion } from '@/components/patterns/busy-region'

describe('BusyRegion', () => {
    it('dims what it holds, marks it busy and announces it outside the dimmed part', () => {
        const { container } = render(
            <BusyRegion busy label="Loading the figures">
                <p>Figures</p>
            </BusyRegion>,
        )
        const region = container.querySelector('[data-slot="busy-region"]')

        expect(region).toHaveAttribute('aria-busy', 'true')
        expect(region).toHaveClass('opacity-60')
        expect(screen.getByText('Figures')).toBeInTheDocument()
        expect(screen.getByRole('status')).toHaveTextContent(
            'Loading the figures',
        )
        expect(region).not.toContainElement(screen.getByRole('status'))
    })

    it('is plain when what it holds is current, and keeps its status region for the next change', () => {
        const { container } = render(
            <BusyRegion busy={false}>
                <p>Figures</p>
            </BusyRegion>,
        )
        const region = container.querySelector('[data-slot="busy-region"]')

        expect(region).not.toHaveAttribute('aria-busy')
        expect(region).not.toHaveClass('opacity-60')
        expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })
})
