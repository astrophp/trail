import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Sparkline } from '@/components/patterns/sparkline'

describe('Sparkline', () => {
    it('draws a path, hidden from assistive technology, and says it in words', () => {
        const { container } = render(
            <Sparkline values={[1, 3, 2]} summary="Up, then down a little" />,
        )
        const svg = container.querySelector('svg')

        expect(svg).toHaveAttribute('aria-hidden', 'true')
        expect(svg?.querySelector('path')?.getAttribute('d')).toBe(
            'M0 98L50 2L100 50',
        )
        expect(screen.getByText('Up, then down a little')).toHaveClass(
            'sr-only',
        )
    })

    it('draws the line in the text colour, with a stroke that does not stretch', () => {
        const { container } = render(
            <Sparkline values={[1, 2]} summary="Rising" />,
        )
        const path = container.querySelector('path')
        const svg = container.querySelector('svg')

        expect(path).toHaveAttribute('stroke', 'currentColor')
        expect(path).toHaveAttribute('vector-effect', 'non-scaling-stroke')
        expect(svg).toHaveAttribute('preserveAspectRatio', 'none')
    })

    it('draws nothing when there are fewer than two values, and still says the summary', () => {
        for (const values of [[], [4], [null, null], [null, 2]]) {
            const { container, unmount } = render(
                <Sparkline values={values} summary="Not enough to draw" />,
            )

            expect(container.querySelector('svg')).toBeNull()
            expect(screen.getByText('Not enough to draw')).toBeInTheDocument()

            unmount()
        }
    })

    it('breaks the line at a null: two sub-paths, not one', () => {
        const { container } = render(
            <Sparkline values={[1, 2, null, 4, 5]} summary="With a gap" />,
        )

        expect(
            container.querySelector('path')?.getAttribute('d')?.match(/M/g),
        ).toHaveLength(2)
    })

    it('takes a class name, which can change the colour', () => {
        const { container } = render(
            <Sparkline
                values={[1, 2]}
                summary="Rising"
                className="extra text-chart-4"
            />,
        )
        const root = container.firstElementChild

        expect(root).toHaveClass('extra', 'text-chart-4')
        expect(root).not.toHaveClass('text-chart-1')
    })
})
