import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExportLinkButton } from '@/components/patterns/export-link-button'

describe('ExportLinkButton', () => {
    it('is a download link to the address it is given, called Export', () => {
        render(<ExportLinkButton href="/trail/api/things/export?range=7d" />)

        const link = screen.getByRole('link', { name: 'Export' })

        expect(link.tagName).toBe('A')
        expect(link).toHaveAttribute(
            'href',
            '/trail/api/things/export?range=7d',
        )
        expect(link).toHaveAttribute('download')
        expect(link).not.toHaveAttribute('title')
    })

    it('says its own words, and a longer name and a hint when it is given them', () => {
        render(
            <ExportLinkButton
                href="/x"
                label="Export the breakdown by model as CSV"
                title="Up to 1,000 rows"
            >
                Export CSV
            </ExportLinkButton>,
        )

        const link = screen.getByRole('link', {
            name: 'Export the breakdown by model as CSV',
        })

        expect(link).toHaveTextContent('Export CSV')
        expect(link).toHaveAttribute('title', 'Up to 1,000 rows')
    })

    it('hides its icon from assistive technology and takes a class name', () => {
        const { container } = render(
            <ExportLinkButton href="/x" className="extra" />,
        )

        expect(screen.getByRole('link')).toHaveClass('extra')
        expect(container.querySelector('svg')).toHaveAttribute(
            'aria-hidden',
            'true',
        )
    })
})
