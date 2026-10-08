import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PanelEmpty } from '@/components/patterns/panel-empty'

describe('PanelEmpty', () => {
    it('says what is missing, and why when it is told', () => {
        const { container, rerender } = render(
            <PanelEmpty title="Nothing needs attention" />,
        )

        expect(screen.getByText('Nothing needs attention')).toBeInTheDocument()
        expect(
            container.querySelector('[data-slot="empty-description"]'),
        ).toBeNull()

        rerender(
            <PanelEmpty
                title="Nothing needs attention"
                description="No failed runs in this period."
            />,
        )

        expect(
            screen.getByText('No failed runs in this period.'),
        ).toBeInTheDocument()
    })

    it('is not a heading, so it cannot skip a level', () => {
        render(<PanelEmpty title="Nothing needs attention" />)

        expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })

    it('takes a class name', () => {
        const { container } = render(
            <PanelEmpty title="Nothing" className="extra" />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
