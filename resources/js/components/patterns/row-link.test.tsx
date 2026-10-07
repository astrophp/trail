import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { RowLink } from '@/components/patterns/row-link'

describe('RowLink', () => {
    it('is a real link to the route, marked as the row link', () => {
        render(
            <MemoryRouter>
                <RowLink to="/fruit/apple" className="extra">
                    Apple
                </RowLink>
            </MemoryRouter>,
        )

        const link = screen.getByRole('link', { name: 'Apple' })

        expect(link).toHaveAttribute('href', '/fruit/apple')
        expect(link).toHaveAttribute('data-slot', 'row-link')
        expect(link).toHaveClass('extra')
    })
})
