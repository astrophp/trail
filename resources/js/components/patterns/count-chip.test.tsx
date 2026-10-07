import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CountChip } from '@/components/patterns/count-chip'

describe('CountChip', () => {
    it('formats the count with thousands separators', () => {
        render(<CountChip count={1284} />)

        expect(screen.getByText('1,284')).toBeInTheDocument()
    })

    it('shows a real zero', () => {
        render(<CountChip count={0} />)

        expect(screen.getByText('0')).toBeInTheDocument()
    })

    it('shows nothing for an unknown count', () => {
        const { container } = render(<CountChip />)

        expect(container).toBeEmptyDOMElement()
    })

    it('accepts a className, also when active', () => {
        render(<CountChip count={3} active className="extra" />)

        expect(screen.getByText('3')).toHaveClass('extra')
    })
})
