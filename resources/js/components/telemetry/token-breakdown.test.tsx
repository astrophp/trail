import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Usage } from '@/api/types'
import { KeyValueList } from '@/components/patterns/key-value-list'
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

    describe('as rows', () => {
        const inList = (usage: Usage, own = false) =>
            render(
                <KeyValueList layout="rows">
                    <TokenBreakdown usage={usage} layout="rows" own={own} />
                </KeyValueList>,
            )
        const cell = (label: string) =>
            screen.getByText(label, { selector: 'dt' })
                .nextElementSibling as HTMLElement

        it('renders each count as a key-value row, the parts indented, adding nothing up', () => {
            inList(reported)

            expect(cell('Input tokens')).toHaveTextContent(formatCount(1200))
            expect(cell('Cache read')).toHaveTextContent(formatCount(800))
            expect(cell('Cache write')).toHaveTextContent(formatCount(100))
            expect(cell('Output tokens')).toHaveTextContent(formatCount(310))
            expect(cell('Reasoning')).toHaveTextContent(formatCount(90))
            expect(cell('Total tokens')).toHaveTextContent(formatCount(1510))
            expect(screen.getByText('Cache read')).toHaveClass(
                'group-data-[layout=rows]/kvl:ps-4',
            )
            expect(document.querySelectorAll('dt')).toHaveLength(6)
        })

        it('says Not reported for a count that was not reported, and Pending while pending', () => {
            const { unmount } = inList({
                ...reported,
                cache_write_tokens: null,
            })

            expect(cell('Cache write')).toHaveTextContent('Not reported')
            expect(cell('Input tokens')).toHaveTextContent(formatCount(1200))

            unmount()
            inList({ ...reported, state: 'pending' })

            for (const label of [
                'Input tokens',
                'Cache read',
                'Total tokens',
            ]) {
                expect(cell(label)).toHaveTextContent('Pending')
            }
        })

        it('shows a real zero as a zero', () => {
            inList({ ...reported, reasoning_tokens: 0 })

            expect(cell('Reasoning')).toHaveTextContent('0')
            expect(cell('Reasoning')).not.toHaveTextContent('Not reported')
        })

        it("labels the main rows as an agent's own when asked", () => {
            inList(reported, true)

            expect(
                screen.getByText('Own input tokens', { selector: 'dt' }),
            ).toBeInTheDocument()
            expect(
                screen.getByText('Own output tokens', { selector: 'dt' }),
            ).toBeInTheDocument()
            expect(
                screen.getByText('Own total tokens', { selector: 'dt' }),
            ).toBeInTheDocument()
            expect(screen.getByText('Cache read')).toBeInTheDocument()
        })
    })
})
