import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from '@/components/patterns/page-header'

describe('PageHeader', () => {
    it('renders the title as the page heading, focusable by script', () => {
        render(<PageHeader title="Traces" />)

        const heading = screen.getByRole('heading', { level: 1 })

        expect(heading).toHaveTextContent('Traces')
        expect(heading).toHaveAttribute('tabindex', '-1')
    })

    it('shows the description only when there is one', () => {
        const { rerender } = render(<PageHeader title="Traces" />)

        expect(screen.queryByText('Every run')).not.toBeInTheDocument()

        rerender(<PageHeader title="Traces" description="Every run" />)

        expect(screen.getByText('Every run')).toHaveClass(
            'text-muted-foreground',
        )
    })

    it('places children as actions', () => {
        render(
            <PageHeader title="Traces">
                <button>Export</button>
            </PageHeader>,
        )

        expect(
            screen.getByRole('button', { name: 'Export' }),
        ).toBeInTheDocument()
    })

    it('shows an icon before the title', () => {
        render(<PageHeader title="Traces" icon={<svg aria-label="Runs" />} />)

        const icon = screen.getByLabelText('Runs')
        const heading = screen.getByRole('heading', { level: 1 })

        expect(
            icon.compareDocumentPosition(heading) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy()
    })

    it('places a badge right after the title', () => {
        render(<PageHeader title="Run" badge={<span>Running</span>} />)

        expect(screen.getByRole('heading', { name: 'Run' }).nextSibling).toBe(
            screen.getByText('Running'),
        )
    })

    it('accepts a className', () => {
        const { container } = render(
            <PageHeader title="Traces" className="extra" />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
