import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Usage } from '@/api/types'
import { TokenValue } from '@/components/telemetry/token-value'

const none: Usage = {
    state: 'reported',
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    reasoning_tokens: null,
    total_tokens: null,
}

describe('TokenValue', () => {
    it('shows the total compactly, with the exact total on hover', () => {
        render(
            <TokenValue
                usage={{
                    ...none,
                    input_tokens: 8_000,
                    output_tokens: 1_432,
                    total_tokens: 9_432,
                }}
            />,
        )

        expect(screen.getByText('9.4k')).toHaveAttribute('aria-hidden', 'true')
        expect(screen.getByText('9,432 tokens')).toHaveClass('sr-only')
        expect(screen.getByText('9.4k').parentElement).toHaveAttribute(
            'title',
            '9,432 tokens',
        )
    })

    it('shows a reported total of 0 as 0: a real zero is a fact', () => {
        render(<TokenValue usage={{ ...none, total_tokens: 0 }} />)

        expect(screen.getByText('0')).toBeInTheDocument()
        expect(screen.getByText('0 tokens')).toBeInTheDocument()
    })

    it('shows a small total whole', () => {
        render(<TokenValue usage={{ ...none, total_tokens: 842 }} />)

        expect(screen.getByText('842')).toBeInTheDocument()
    })

    it('shows Pending', () => {
        render(<TokenValue usage={{ ...none, state: 'pending' }} />)

        expect(screen.getByText('Pending')).toBeInTheDocument()
    })

    it('shows Not reported', () => {
        render(<TokenValue usage={{ ...none, state: 'not_reported' }} />)

        expect(screen.getByText('Not reported')).toBeInTheDocument()
    })

    it('shows Not reported when only other counts were reported', () => {
        render(<TokenValue usage={{ ...none, cache_read_tokens: 120 }} />)

        expect(screen.getByText('Not reported')).toBeInTheDocument()
    })

    it.each<[string, Usage]>([
        ['pending', { ...none, state: 'pending' }],
        [
            'pending with counts',
            {
                ...none,
                state: 'pending',
                input_tokens: 1_200,
                output_tokens: 300,
                total_tokens: 1_500,
            },
        ],
        ['not_reported', { ...none, state: 'not_reported' }],
        [
            'reported without a total',
            { ...none, cache_read_tokens: 120, reasoning_tokens: 40 },
        ],
    ])('renders no digit at all for %s', (_name, usage) => {
        const { container } = render(<TokenValue usage={usage} />)

        expect(container.textContent).not.toMatch(/\d/)
    })

    it.each<Usage>([
        { ...none, total_tokens: 10 },
        { ...none, state: 'pending' },
        { ...none, state: 'not_reported' },
    ])('accepts a className for $state', (usage) => {
        const { container } = render(
            <TokenValue usage={usage} className="extra" />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })

    describe('pendingAmount="show"', () => {
        it('shows the total so far with a Pending tag', () => {
            render(
                <TokenValue
                    usage={{
                        ...none,
                        state: 'pending',
                        total_tokens: 7_901_600,
                    }}
                    pendingAmount="show"
                />,
            )

            expect(screen.getByText('7.9M')).toBeInTheDocument()
            expect(screen.getByText('7,901,600 tokens')).toBeInTheDocument()
            expect(screen.getByText(/^Pending/)).toBeInTheDocument()
        })

        it('says Pending, never 0, when nothing was recorded', () => {
            const { container } = render(
                <TokenValue
                    usage={{ ...none, state: 'pending' }}
                    pendingAmount="show"
                />,
            )

            expect(screen.getByText('Pending')).toBeInTheDocument()
            expect(container.textContent).not.toMatch(/\d/)
        })

        it('does not change a settled total', () => {
            render(
                <TokenValue
                    usage={{ ...none, total_tokens: 842 }}
                    pendingAmount="show"
                />,
            )

            expect(screen.getByText('842')).toBeInTheDocument()
            expect(screen.queryByText(/Pending/)).not.toBeInTheDocument()
        })

        it('is off by default: a pending total with a count is still only Pending', () => {
            const { container } = render(
                <TokenValue
                    usage={{ ...none, state: 'pending', total_tokens: 99 }}
                />,
            )

            expect(screen.getByText('Pending')).toBeInTheDocument()
            expect(container.textContent).not.toMatch(/\d/)
        })
    })
})
