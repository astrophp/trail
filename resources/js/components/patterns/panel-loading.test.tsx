import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PanelLoading } from '@/components/patterns/panel-loading'

describe('PanelLoading', () => {
    it('is busy and says so in words', () => {
        const { container } = render(<PanelLoading />)

        expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
        expect(screen.getByText('Loading')).toHaveClass('sr-only')
    })

    it.each([1, 3, 5])('draws %s placeholder rows', (rows) => {
        const { container } = render(<PanelLoading rows={rows} />)

        expect(
            container.querySelectorAll('[data-slot="skeleton"]'),
        ).toHaveLength(rows)
    })

    it('draws three rows unless told otherwise', () => {
        const { container } = render(<PanelLoading />)

        expect(
            container.querySelectorAll('[data-slot="skeleton"]'),
        ).toHaveLength(3)
    })

    it('takes a class name', () => {
        const { container } = render(<PanelLoading className="extra" />)

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
