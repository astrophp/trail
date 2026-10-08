import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeAgentSpan, makeStepSpan, makeToolSpan } from '@/test/trace-api'
import { TreeHarness } from '@/test/tree-harness'
import { names, row, rows } from '@/test/tree-queries'

const rateLimit = {
    class: 'RateLimitedException',
    message: 'Application rate limited by AI provider [anthropic].',
    source: 'step',
    http_status: 429,
} as const

// An agent whose first attempt failed on a rate limit and whose second one answered.
const failover = [
    makeAgentSpan('root', { sequence: 1 }),
    makeStepSpan('first-0', {
        sequence: 2,
        parent_id: 'root',
        attempt: 1,
        step_number: 0,
        status: 'failed',
        issue_kind: 'rate_limited',
        error: rateLimit,
    }),
    makeStepSpan('second-0', {
        sequence: 3,
        parent_id: 'root',
        attempt: 2,
        step_number: 0,
    }),
    makeToolSpan('second-tool', {
        sequence: 4,
        parent_id: 'root',
        attempt: 2,
        name: 'search',
    }),
    makeStepSpan('second-1', {
        sequence: 5,
        parent_id: 'root',
        attempt: 2,
        step_number: 1,
    }),
]

const toggle = (item: HTMLElement) =>
    item.querySelector('[data-slot="span-row-toggle"]') as Element

describe('attempt rows', () => {
    it('groups the children of an agent that failed over under one row per attempt', () => {
        render(<TreeHarness spans={failover} />)

        expect(names()).toEqual([
            'SupportAssistant, Completed',
            'Attempt 1 of 2',
            'Model step 1, Failed',
            'Attempt 2 of 2',
            'Model step 1, Completed',
            'search, Completed',
            'Model step 2, Completed',
        ])
        expect(rows().map((item) => item.getAttribute('aria-level'))).toEqual([
            '1',
            '2',
            '3',
            '2',
            '3',
            '3',
            '3',
        ])
    })

    it('makes an attempt row a parent of the tree: expanded, with a place, and never selectable', () => {
        render(<TreeHarness spans={failover} />)

        const attempt = row('Attempt 2 of 2')

        expect(attempt).toHaveAttribute('aria-expanded', 'true')
        expect(attempt).toHaveAttribute('aria-posinset', '2')
        expect(attempt).toHaveAttribute('aria-setsize', '2')
        expect(attempt).not.toHaveAttribute('aria-selected')
        expect(
            rows().filter((item) => item.hasAttribute('aria-selected')),
        ).toHaveLength(5)
    })

    it('shows the failure of a failed attempt: its issue, its message in full on hover, and a button to the span', async () => {
        const onSelect = vi.fn()
        render(<TreeHarness spans={failover} onSelect={onSelect} />)

        const attempt = row('Attempt 1 of 2')

        expect(within(attempt).getByText('Rate limited')).toBeInTheDocument()
        expect(within(attempt).getByText(rateLimit.message)).toHaveAttribute(
            'title',
            rateLimit.message,
        )
        expect(attempt).toHaveAccessibleDescription(
            /Failed.*Rate limited.*rate limited by AI provider/,
        )

        await userEvent.click(
            within(attempt).getByRole('button', { name: /Show failure/ }),
        )

        expect(onSelect).toHaveBeenCalledExactlyOnceWith('first-0')
        expect(row('Model step 1, Failed')).toHaveAttribute(
            'aria-selected',
            'true',
        )
        // The button does not also open or close the row.
        expect(attempt).toHaveAttribute('aria-expanded', 'true')
    })

    it('marks the attempt that answered with words and an icon', () => {
        render(<TreeHarness spans={failover} />)

        const answered = row('Attempt 2 of 2')

        expect(within(answered).getByText('Answered')).toBeInTheDocument()
        expect(answered.querySelector('svg')).not.toBeNull()
        expect(within(answered).queryByRole('button')).not.toBeInTheDocument()
    })

    it('says Failed on the last attempt of an agent that failed', () => {
        render(
            <TreeHarness
                spans={[
                    makeAgentSpan('root', { sequence: 1, status: 'failed' }),
                    makeStepSpan('a', {
                        sequence: 2,
                        parent_id: 'root',
                        attempt: 1,
                    }),
                    makeStepSpan('b', {
                        sequence: 3,
                        parent_id: 'root',
                        attempt: 2,
                    }),
                ]}
            />,
        )

        expect(
            within(row('Attempt 2 of 2')).getByText('Failed'),
        ).toBeInTheDocument()
        expect(
            within(row('Attempt 1 of 2')).queryByText(/Failed|Answered/),
        ).not.toBeInTheDocument()
    })

    it('shows no attempt row and no attempt label for an agent with one attempt', () => {
        render(
            <TreeHarness
                spans={[
                    makeAgentSpan('root', { sequence: 1 }),
                    makeStepSpan('a', {
                        sequence: 2,
                        parent_id: 'root',
                        attempt: 1,
                        step_number: 0,
                    }),
                    makeToolSpan('b', { sequence: 3, parent_id: 'root' }),
                ]}
            />,
        )

        expect(names()).toEqual([
            'SupportAssistant, Completed',
            'Model step 1, Completed',
            'search, Completed',
        ])
        expect(screen.queryByText(/Attempt/)).not.toBeInTheDocument()
    })

    it('groups a delegated agent by its own failover and leaves the agent above it alone', () => {
        render(
            <TreeHarness
                spans={[
                    makeAgentSpan('outer', { sequence: 1, name: 'Outer' }),
                    makeToolSpan('ask', {
                        sequence: 2,
                        parent_id: 'outer',
                        name: 'ask',
                    }),
                    makeAgentSpan('inner', {
                        sequence: 3,
                        parent_id: 'ask',
                        name: 'Inner',
                    }),
                    makeStepSpan('i1', {
                        sequence: 4,
                        parent_id: 'inner',
                        attempt: 1,
                        step_number: 0,
                        status: 'failed',
                    }),
                    makeStepSpan('i2', {
                        sequence: 5,
                        parent_id: 'inner',
                        attempt: 2,
                        step_number: 0,
                    }),
                ]}
            />,
        )

        expect(names()).toEqual([
            'Outer, Completed',
            'ask, Completed',
            'Inner, Completed',
            'Attempt 1 of 2',
            'Model step 1, Failed',
            'Attempt 2 of 2',
            'Model step 1, Completed',
        ])
        expect(rows().map((item) => item.getAttribute('aria-level'))).toEqual([
            '1',
            '2',
            '3',
            '4',
            '5',
            '4',
            '5',
        ])
    })

    it('opens and closes on a click and on Enter or Space, and never selects', async () => {
        const onSelect = vi.fn()
        render(<TreeHarness spans={failover} onSelect={onSelect} />)

        const attempt = row('Attempt 2 of 2')

        await userEvent.click(attempt)
        expect(attempt).toHaveAttribute('aria-expanded', 'false')

        attempt.focus()
        await userEvent.keyboard('{Enter}')
        expect(attempt).toHaveAttribute('aria-expanded', 'true')

        await userEvent.keyboard(' ')
        expect(attempt).toHaveAttribute('aria-expanded', 'false')

        await userEvent.click(toggle(attempt))
        expect(attempt).toHaveAttribute('aria-expanded', 'true')
        expect(onSelect).not.toHaveBeenCalled()
        expect(row('SupportAssistant, Completed')).toHaveAttribute(
            'aria-selected',
            'true',
        )
    })

    it('hides the spans of a collapsed attempt and keeps the others', async () => {
        render(<TreeHarness spans={failover} />)

        await userEvent.click(toggle(row('Attempt 2 of 2')))

        expect(names()).toEqual([
            'SupportAssistant, Completed',
            'Attempt 1 of 2',
            'Model step 1, Failed',
            'Attempt 2 of 2',
        ])
    })

    it('puts attempt rows in the arrow-key walk, and ArrowLeft from a span goes to its attempt', async () => {
        render(<TreeHarness spans={failover} />)
        row('SupportAssistant, Completed').focus()

        await userEvent.keyboard('{ArrowDown}')
        expect(row('Attempt 1 of 2')).toHaveFocus()

        await userEvent.keyboard('{ArrowDown}')
        expect(row('Model step 1, Failed')).toHaveFocus()

        await userEvent.keyboard('{ArrowLeft}')
        expect(row('Attempt 1 of 2')).toHaveFocus()

        await userEvent.keyboard('{ArrowLeft}')
        expect(row('Attempt 1 of 2')).toHaveAttribute('aria-expanded', 'false')

        await userEvent.keyboard('{ArrowLeft}')
        expect(row('SupportAssistant, Completed')).toHaveFocus()

        await userEvent.keyboard('{End}')
        expect(row('Model step 2, Completed')).toHaveFocus()
    })

    it('opens a closed attempt with ArrowRight and then moves into it', async () => {
        render(<TreeHarness spans={failover} />)
        const attempt = row('Attempt 2 of 2')

        await userEvent.click(toggle(attempt))
        attempt.focus()
        await userEvent.keyboard('{ArrowRight}')

        expect(attempt).toHaveAttribute('aria-expanded', 'true')

        await userEvent.keyboard('{ArrowRight}')

        expect(row(/Model step 1, Completed/)).toHaveFocus()
    })

    it('keeps one tab stop, and never makes an attempt row the selection', () => {
        render(<TreeHarness spans={failover} initial="second-tool" />)

        expect(
            rows().filter((item) => item.getAttribute('tabindex') === '0'),
        ).toEqual([row('search, Completed')])
        expect(
            within(row('Attempt 1 of 2')).getByRole('button'),
        ).toHaveAttribute('tabindex', '-1')
    })
})

describe('attempt rows: name and description', () => {
    it('name the attempt once, and describe how it ended once', () => {
        render(<TreeHarness spans={failover} />)

        const failed = row('Attempt 1 of 2')
        const answered = row('Attempt 2 of 2')

        expect(failed).toHaveAccessibleName('Attempt 1 of 2')
        expect(failed).toHaveAccessibleDescription(
            `Failed Rate limited ${rateLimit.message}`,
        )
        expect(answered).toHaveAccessibleName('Attempt 2 of 2')
        expect(answered).toHaveAccessibleDescription('Answered')
    })

    it('use the stored attempt numbers when there is a gap', () => {
        render(
            <TreeHarness
                spans={[
                    makeAgentSpan('root', { sequence: 1 }),
                    makeStepSpan('a', {
                        sequence: 2,
                        parent_id: 'root',
                        attempt: 1,
                    }),
                    makeStepSpan('c', {
                        sequence: 3,
                        parent_id: 'root',
                        attempt: 3,
                    }),
                ]}
            />,
        )

        expect(
            screen
                .getAllByRole('treeitem')
                .map((item) => item.getAttribute('aria-label')),
        ).toEqual([
            'SupportAssistant, Completed',
            'Attempt 1 of 3',
            'Model step 1, Completed',
            'Attempt 3 of 3',
            'Model step 1, Completed',
        ])
        expect(row('Attempt 3 of 3')).toHaveAttribute('aria-posinset', '2')
        expect(row('Attempt 3 of 3')).toHaveAttribute('aria-setsize', '2')
    })

    it.each(['running', 'incomplete', 'awaiting_approval'] as const)(
        'make no claim about how the last attempt ended while the agent is %s',
        (status) => {
            render(
                <TreeHarness
                    spans={[
                        makeAgentSpan('root', { sequence: 1, status }),
                        makeStepSpan('a', {
                            sequence: 2,
                            parent_id: 'root',
                            attempt: 1,
                        }),
                        makeStepSpan('b', {
                            sequence: 3,
                            parent_id: 'root',
                            attempt: 2,
                        }),
                    ]}
                />,
            )

            expect(row('Attempt 2 of 2')).toHaveAccessibleDescription('')
            expect(
                screen.queryByText(/Answered|Failed/),
            ).not.toBeInTheDocument()
        },
    )
})

describe('keys pressed inside an attempt row', () => {
    it('are not taken by the tree when they come from the button in it, while the same key on a row acts', async () => {
        const onSelect = vi.fn()
        render(<TreeHarness spans={failover} onSelect={onSelect} />)

        const button = within(row('Attempt 1 of 2')).getByRole('button')

        button.focus()
        await userEvent.keyboard('e')
        await userEvent.keyboard('{ArrowDown}')

        expect(button).toHaveFocus()
        expect(onSelect).not.toHaveBeenCalled()

        row('SupportAssistant, Completed').focus()
        await userEvent.keyboard('e')

        expect(row('Model step 1, Failed')).toHaveFocus()
        expect(onSelect).toHaveBeenCalledExactlyOnceWith('first-0')
    })
})
