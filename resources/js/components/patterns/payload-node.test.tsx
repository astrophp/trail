import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PayloadNode } from '@/components/patterns/payload-node'

describe('PayloadNode', () => {
    it('shows a leaf under its key', () => {
        render(<PayloadNode name="city" value="Oslo" redactionMarker="m" />)

        expect(screen.getByText('city')).toBeVisible()
        expect(screen.getByText('Oslo')).toBeVisible()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('puts quotes round a string and none round other values', () => {
        const { container } = render(
            <>
                <PayloadNode value="s" redactionMarker="m" />
                <PayloadNode value={7} redactionMarker="m" />
            </>,
        )

        expect(container.textContent).toBe('"s"7')
    })

    it('starts a container at its depth open or closed', () => {
        render(
            <>
                <PayloadNode
                    name="open"
                    value={{ a: 1 }}
                    depth={1}
                    redactionMarker="m"
                />
                <PayloadNode
                    name="shut"
                    value={{ b: 2 }}
                    depth={2}
                    redactionMarker="m"
                />
            </>,
        )

        expect(screen.getByRole('button', { name: /open/ })).toHaveAttribute(
            'aria-expanded',
            'true',
        )
        expect(screen.getByRole('button', { name: /shut/ })).toHaveAttribute(
            'aria-expanded',
            'false',
        )
        expect(screen.getByText('a')).toBeVisible()
        expect(screen.queryByText('b')).not.toBeInTheDocument()
    })

    it('names the top-level disclosure after the payload, with what is in it', () => {
        render(
            <>
                <PayloadNode
                    value={{ a: 1, b: 2 }}
                    rootLabel="arguments"
                    redactionMarker="m"
                />
                <PayloadNode
                    value={[1]}
                    rootLabel="results"
                    redactionMarker="m"
                />
            </>,
        )

        expect(
            screen.getByRole('button', {
                name: 'arguments, object with 2 entries',
            }),
        ).toBeVisible()
        expect(
            screen.getByRole('button', { name: 'results, array with 1 item' }),
        ).toBeVisible()
    })

    it('starts a wide container closed, but not at the top level', () => {
        const wide = Array.from({ length: 21 }, (_, i) => `c-${i}`)

        render(
            <>
                <PayloadNode
                    name="top"
                    value={wide}
                    depth={0}
                    redactionMarker="m"
                />
                <PayloadNode
                    name="inner"
                    value={wide}
                    depth={1}
                    redactionMarker="m"
                />
            </>,
        )

        expect(screen.getByRole('button', { name: /top/ })).toHaveAttribute(
            'aria-expanded',
            'true',
        )
        expect(screen.getByRole('button', { name: /inner/ })).toHaveAttribute(
            'aria-expanded',
            'false',
        )
        expect(screen.getAllByText('c-0')).toHaveLength(1)
    })
})
