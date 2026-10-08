import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Usage } from '@/api/types'
import { TokenBreakdown } from '@/components/telemetry/token-breakdown'
import { formatCount } from '@/lib/format'

const none: Usage = {
    state: 'not_reported',
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    reasoning_tokens: null,
    total_tokens: null,
}

const reported: Usage = {
    state: 'reported',
    input_tokens: 1200,
    output_tokens: 310,
    cache_read_tokens: 800,
    cache_write_tokens: 100,
    reasoning_tokens: 90,
    total_tokens: 1510,
}

const row = (label: string) =>
    within(screen.getByText(label).closest('div') as HTMLElement)

describe('TokenBreakdown', () => {
    it('shows every count as the API sent it', () => {
        render(<TokenBreakdown usage={reported} />)

        expect(row('Input').getByText(formatCount(1200))).toBeInTheDocument()
        expect(row('Output').getByText(formatCount(310))).toBeInTheDocument()
        expect(
            row('of which cache read').getByText(formatCount(800)),
        ).toBeInTheDocument()
        expect(
            row('of which cache write').getByText(formatCount(100)),
        ).toBeInTheDocument()
        expect(
            row('of which reasoning').getByText(formatCount(90)),
        ).toBeInTheDocument()
        expect(row('Total').getByText(formatCount(1510))).toBeInTheDocument()
    })

    it('presents cache counts as parts of the input and reasoning as part of the output, not added on top', () => {
        render(<TokenBreakdown usage={reported} />)

        const labels = screen
            .getAllByRole('term')
            .map((term) => term.textContent)

        expect(labels).toEqual([
            'Input',
            'of which cache read',
            'of which cache write',
            'Output',
            'of which reasoning',
            'Total',
        ])
        // 1200 + 310 would be the total; the parts are not added to it.
        expect(screen.queryByText(formatCount(1200 + 800))).toBeNull()
        expect(row('of which cache read').getByText('800')).toHaveClass(
            'tabular-nums',
        )
    })

    it('says Not reported for a count that is null and keeps the others', () => {
        render(
            <TokenBreakdown
                usage={{
                    ...reported,
                    cache_write_tokens: null,
                    reasoning_tokens: null,
                }}
            />,
        )

        expect(screen.getAllByText('Not reported')).toHaveLength(2)
        expect(
            row('of which cache write').getByText('Not reported'),
        ).toBeInTheDocument()
        expect(row('Input').getByText('1,200')).toBeInTheDocument()
    })

    it('says Not reported everywhere when nothing was reported, never zero', () => {
        render(<TokenBreakdown usage={none} />)

        expect(screen.getAllByText('Not reported')).toHaveLength(6)
        expect(screen.queryByText('0')).not.toBeInTheDocument()
    })

    it('says Pending everywhere while the call runs, though it carries counts so far', () => {
        render(
            <TokenBreakdown
                usage={{ ...none, state: 'pending', input_tokens: 1200 }}
            />,
        )

        expect(screen.getAllByText('Pending')).toHaveLength(6)
        expect(screen.queryByText('1,200')).not.toBeInTheDocument()
    })

    it('accepts a className', () => {
        const { container } = render(
            <TokenBreakdown usage={none} className="extra" />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
