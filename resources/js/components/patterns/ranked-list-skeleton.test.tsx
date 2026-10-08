import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RankedListSkeleton } from '@/components/patterns/ranked-list-skeleton'

describe('RankedListSkeleton', () => {
    it.each([1, 3, 5])('draws %s entries', (count) => {
        const { container } = render(<RankedListSkeleton count={count} />)

        expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(
            count,
        )
    })

    it('draws three entries unless told otherwise', () => {
        const { container } = render(<RankedListSkeleton />)

        expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(
            3,
        )
    })

    it('is busy, says so in words, and takes a class name', () => {
        const { container } = render(<RankedListSkeleton className="extra" />)

        expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
        expect(container.firstElementChild).toHaveClass('extra')
        expect(screen.getByText('Loading')).toHaveClass('sr-only')
    })
})
