import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useMemo, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AgentSubtotal, Span } from '@/api/types'
import { buildSpanTree } from '@/features/trace/build-span-tree'
import { SpanTree } from '@/features/trace/span-tree'
import { formatCost } from '@/lib/format'
import {
    detailFixture,
    makeAgentSpan,
    makeEmbeddingSpan,
    makeStepSpan,
    makeToolSpan,
} from '@/test/trace-api'

type HarnessProps = {
    spans: Span[]
    initial?: string
    agents?: AgentSubtotal[]
    onSelect?: (id: string) => void
}

/** The tree with a selection of its own, as the page keeps one in the URL. */
function Harness({ spans, initial, agents = [], onSelect }: HarnessProps) {
    const tree = useMemo(() => buildSpanTree(spans), [spans])
    const byAgent = useMemo(
        () => new Map(agents.map((agent) => [agent.span_id, agent])),
        [agents],
    )
    const [selected, setSelected] = useState<string | null>(
        initial ?? tree.roots[0]?.span.id ?? null,
    )

    return (
        <SpanTree
            tree={tree}
            selectedId={selected}
            onSelect={(id) => {
                setSelected(id)
                onSelect?.(id)
            }}
            agents={byAgent}
        />
    )
}

const row = (name: string | RegExp) => screen.getByRole('treeitem', { name })
const rows = () => screen.getAllByRole('treeitem')
const names = () => rows().map((item) => item.getAttribute('aria-label'))

// One agent with a step, a tool and a second step.
const plain = [
    makeAgentSpan('root', { sequence: 1 }),
    makeStepSpan('s1', { sequence: 2, parent_id: 'root', step_number: 0 }),
    makeToolSpan('t1', {
        sequence: 3,
        parent_id: 'root',
        duration_ms: 1500,
    }),
    makeStepSpan('s2', { sequence: 4, parent_id: 'root', step_number: 1 }),
]

const delegation = [
    makeAgentSpan('a1', { sequence: 1, name: 'Triage' }),
    makeToolSpan('t1', { sequence: 2, parent_id: 'a1', name: 'ask_research' }),
    makeAgentSpan('a2', { sequence: 3, parent_id: 't1', name: 'Research' }),
    makeToolSpan('t2', { sequence: 4, parent_id: 'a2', name: 'fetch' }),
    makeAgentSpan('a3', { sequence: 5, parent_id: 't2', name: 'Fetcher' }),
]

const failover = [
    makeAgentSpan('root', { sequence: 1 }),
    makeStepSpan('first-0', {
        sequence: 2,
        parent_id: 'root',
        attempt: 1,
        step_number: 0,
        status: 'failed',
    }),
    makeStepSpan('second-0', {
        sequence: 3,
        parent_id: 'root',
        attempt: 2,
        step_number: 0,
    }),
    makeStepSpan('second-1', {
        sequence: 4,
        parent_id: 'root',
        attempt: 2,
        step_number: 1,
    }),
]

describe('the execution tree', () => {
    it('is a tree with a name, and every span is a treeitem in it', () => {
        render(<Harness spans={plain} />)

        const tree = screen.getByRole('tree', { name: 'Execution tree' })

        expect(within(tree).getAllByRole('treeitem')).toHaveLength(4)
    })

    it('shows a plain run: the agent at level 1, expanded, its children at level 2', () => {
        render(<Harness spans={plain} />)

        expect(names()).toEqual([
            'SupportAssistant, Completed',
            'Model step 1, Completed',
            'search, Completed',
            'Model step 2, Completed',
        ])
        expect(rows().map((item) => item.getAttribute('aria-level'))).toEqual([
            '1',
            '2',
            '2',
            '2',
        ])
        expect(rows()[0]).toHaveAttribute('aria-expanded', 'true')

        for (const leaf of rows().slice(1)) {
            expect(leaf).not.toHaveAttribute('aria-expanded')
        }
    })

    it('gives each row its set size and its place in it', () => {
        render(<Harness spans={plain} />)

        expect(
            rows().map((item) => [
                item.getAttribute('aria-posinset'),
                item.getAttribute('aria-setsize'),
            ]),
        ).toEqual([
            ['1', '1'],
            ['1', '3'],
            ['2', '3'],
            ['3', '3'],
        ])
    })

    it('words each row with its title and a second line', () => {
        render(<Harness spans={plain} />)

        const agent = row('SupportAssistant, Completed')
        const step = row('Model step 1, Completed')
        const tool = row('search, Completed')

        expect(within(agent).getByText('Agent run')).toBeInTheDocument()
        expect(within(step).getByText('claude-sonnet-4-5')).toHaveClass(
            'font-mono',
        )
        expect(within(tool).getByText('Tool call')).toBeInTheDocument()
    })

    it('shows the status as a badge only for a row that is not completed, and in every name', () => {
        render(
            <Harness
                spans={[
                    makeAgentSpan('root', { sequence: 1 }),
                    makeStepSpan('bad', {
                        sequence: 2,
                        parent_id: 'root',
                        step_number: 0,
                        status: 'failed',
                    }),
                ]}
            />,
        )

        expect(
            within(row('Model step 1, Failed')).getByText('Failed'),
        ).toBeInTheDocument()
        expect(
            within(row('SupportAssistant, Completed')).queryByText('Completed'),
        ).not.toBeInTheDocument()
    })

    it('shows duration, and tokens and cost only on spans that bill', () => {
        render(<Harness spans={plain} />)

        const step = within(row('Model step 1, Completed'))

        expect(step.getByText('840 ms')).toBeInTheDocument()
        expect(step.getByText('1.5k')).toBeInTheDocument()
        expect(step.getByText(formatCost(0.00825))).toBeInTheDocument()

        const tool = within(row('search, Completed'))

        expect(tool.getByText('1.50s')).toBeInTheDocument()
        expect(tool.queryByText(/tokens/)).not.toBeInTheDocument()
        expect(tool.queryByText(/\$/)).not.toBeInTheDocument()
    })

    it("takes an agent's tokens and cost from the server's subtotal, never from its steps", () => {
        render(
            <Harness
                spans={plain}
                agents={[
                    {
                        span_id: 'root',
                        name: 'SupportAssistant',
                        usage: {
                            ...detailFixture.data.usage.agents[0].usage,
                            total_tokens: 9_999,
                        },
                        cost: { state: 'estimated', amount: 0.5 },
                    },
                ]}
            />,
        )

        const agent = within(row('SupportAssistant, Completed'))

        expect(agent.getByText('10.0k')).toBeInTheDocument()
        expect(agent.getByText('$0.5000')).toBeInTheDocument()
    })

    it('shows nothing for the tokens of an agent the server has no subtotal for', () => {
        render(<Harness spans={plain} />)

        const agent = within(row('SupportAssistant, Completed'))

        expect(
            agent.queryByText(/Not reported|Pending/),
        ).not.toBeInTheDocument()
    })

    it('labels attempts only when the run made more than one', () => {
        const { unmount } = render(<Harness spans={plain} />)

        expect(screen.queryByText(/Attempt/)).not.toBeInTheDocument()

        unmount()
        render(<Harness spans={failover} />)

        expect(screen.getAllByText('Attempt 1 of 2')).toHaveLength(2)
        expect(screen.getAllByText('Attempt 2 of 2')).toHaveLength(2)
    })

    it('numbers steps per attempt and never across attempts', () => {
        render(<Harness spans={failover} />)

        expect(names()).toEqual([
            'SupportAssistant, Completed',
            'Model step 1, Failed',
            'Model step 1, Completed',
            'Model step 2, Completed',
        ])
    })

    it('nests two levels of delegation, with the delegated agents marked as such', () => {
        render(<Harness spans={delegation} />)

        expect(
            rows().map((item) => [
                item.getAttribute('aria-label'),
                item.getAttribute('aria-level'),
            ]),
        ).toEqual([
            ['Triage, Completed', '1'],
            ['ask_research, Completed', '2'],
            ['Research, Completed', '3'],
            ['fetch, Completed', '4'],
            ['Fetcher, Completed', '5'],
        ])
        expect(
            within(row('Triage, Completed')).getByText('Agent run'),
        ).toBeInTheDocument()
        expect(
            within(row('Research, Completed')).getByText('Delegated agent'),
        ).toBeInTheDocument()
    })

    it('shows an embedding-only run as one row', () => {
        render(
            <Harness
                spans={[
                    makeEmbeddingSpan('e', { sequence: 1, name: 'embeddings' }),
                ]}
            />,
        )

        expect(names()).toEqual(['embeddings, Completed'])
        expect(rows()[0]).not.toHaveAttribute('aria-expanded')
        expect(
            within(rows()[0]).getByText('text-embedding-3-small'),
        ).toBeInTheDocument()
    })

    it('shows a span whose parent is missing at the top level', () => {
        render(
            <Harness
                spans={[
                    makeAgentSpan('root', { sequence: 1 }),
                    makeToolSpan('orphan', {
                        sequence: 2,
                        parent_id: 'gone',
                        name: 'lost',
                    }),
                ]}
            />,
        )

        expect(row('lost, Completed')).toHaveAttribute('aria-level', '1')
        expect(row('lost, Completed')).toHaveAttribute('aria-setsize', '2')
    })

    it('shows every span of a parent cycle once', () => {
        render(
            <Harness
                spans={[
                    makeToolSpan('a', {
                        sequence: 1,
                        parent_id: 'b',
                        name: 'a',
                    }),
                    makeToolSpan('b', {
                        sequence: 2,
                        parent_id: 'a',
                        name: 'b',
                    }),
                ]}
            />,
        )

        expect(names()).toEqual(['a, Completed', 'b, Completed'])
        expect(row('b, Completed')).toHaveAttribute('aria-level', '2')
    })

    it('selects a row on a click, and marks only that one selected', async () => {
        const onSelect = vi.fn()
        render(<Harness spans={plain} onSelect={onSelect} />)

        expect(row('SupportAssistant, Completed')).toHaveAttribute(
            'aria-selected',
            'true',
        )

        await userEvent.click(row('search, Completed'))

        expect(onSelect).toHaveBeenCalledExactlyOnceWith('t1')
        expect(
            rows().filter(
                (item) => item.getAttribute('aria-selected') === 'true',
            ),
        ).toEqual([row('search, Completed')])
    })

    it('toggles a row from its chevron without selecting it', async () => {
        const onSelect = vi.fn()
        render(<Harness spans={plain} onSelect={onSelect} />)

        const root = row('SupportAssistant, Completed')
        const chevron = root.querySelector('[data-slot="span-row-toggle"]')

        await userEvent.click(chevron as Element)

        expect(root).toHaveAttribute('aria-expanded', 'false')
        expect(rows()).toHaveLength(1)
        expect(onSelect).not.toHaveBeenCalled()

        await userEvent.click(chevron as Element)

        expect(root).toHaveAttribute('aria-expanded', 'true')
        expect(rows()).toHaveLength(4)
    })

    it('opens what hides the span that gets selected from outside', async () => {
        const { rerender } = render(<RerenderHarness selected="root" />)

        await userEvent.click(
            row('Triage, Completed').querySelector(
                '[data-slot="span-row-toggle"]',
            ) as Element,
        )
        expect(rows()).toHaveLength(1)

        rerender(<RerenderHarness selected="a3" />)

        expect(rows()).toHaveLength(5)
        expect(row('Fetcher, Completed')).toHaveAttribute(
            'aria-selected',
            'true',
        )
    })
})

/** A tree whose selection the test sets from outside, as the URL does. */
function RerenderHarness({ selected }: { selected: string }) {
    const tree = useMemo(() => buildSpanTree(delegation), [])
    const agents = useMemo(() => new Map<string, AgentSubtotal>(), [])

    return (
        <SpanTree
            tree={tree}
            selectedId={selected === 'root' ? 'a1' : selected}
            onSelect={() => {}}
            agents={agents}
        />
    )
}

describe('the rows of the execution tree', () => {
    const chain = Array.from({ length: 12 }, (_, level) =>
        makeAgentSpan(`l${level}`, {
            sequence: level + 1,
            name: `Level ${level + 1}`,
            parent_id: level === 0 ? null : `l${level - 1}`,
        }),
    )
    const indent = (name: string) =>
        (row(name).firstElementChild as HTMLElement).style.paddingInlineStart

    it('stops indenting at 8 levels, while aria-level stays the real level', () => {
        render(<Harness spans={chain} />)

        expect(row('Level 12, Completed')).toHaveAttribute('aria-level', '12')
        expect(indent('Level 1, Completed')).toBe('calc(var(--spacing) * 0)')
        expect(indent('Level 9, Completed')).toBe('calc(var(--spacing) * 32)')
        expect(indent('Level 12, Completed')).toBe(indent('Level 9, Completed'))
    })

    it('describes a row with its second line and its facts', () => {
        render(<Harness spans={delegation} />)

        expect(row('Research, Completed')).toHaveAccessibleDescription(
            /Delegated agent/,
        )
        expect(row('ask_research, Completed')).toHaveAccessibleDescription(
            /Tool call/,
        )
        expect(row('Triage, Completed')).toHaveAccessibleDescription(
            /Agent run.*840 ms/,
        )
    })

    it('describes a step by its model, or by Not captured when there is none', () => {
        render(
            <Harness
                spans={[
                    makeAgentSpan('root', { sequence: 1 }),
                    makeStepSpan('s1', {
                        sequence: 2,
                        parent_id: 'root',
                        step_number: 0,
                    }),
                    makeStepSpan('s2', {
                        sequence: 3,
                        parent_id: 'root',
                        step_number: 1,
                        model: null,
                    }),
                ]}
            />,
        )

        expect(row('Model step 1, Completed')).toHaveAccessibleDescription(
            /claude-sonnet-4-5/,
        )
        expect(row('Model step 2, Completed')).toHaveAccessibleDescription(
            /Not captured/,
        )
        expect(screen.queryByText('Model not captured')).not.toBeInTheDocument()
    })

    it("says an agent's tokens and cost are its own, in the description and on hover; a step's are not", () => {
        render(
            <Harness
                spans={plain}
                agents={[
                    {
                        span_id: 'root',
                        name: 'SupportAssistant',
                        usage: {
                            ...detailFixture.data.usage.agents[0].usage,
                            total_tokens: 9_999,
                        },
                        cost: { state: 'estimated', amount: 0.5 },
                    },
                ]}
            />,
        )

        const agent = row('SupportAssistant, Completed')

        expect(agent).toHaveAccessibleDescription(/Own tokens.*Own cost/)
        expect(
            within(agent)
                .getByText('10.0k')
                .closest(
                    '[title="This agent\'s own steps, without delegated agents"]',
                ),
        ).not.toBeNull()
        expect(row('Model step 1, Completed')).not.toHaveAccessibleDescription(
            /Own/,
        )
    })
})

describe('the execution tree, by keyboard', () => {
    const tabbable = () =>
        rows().filter((item) => item.getAttribute('tabindex') === '0')

    it('has exactly one row in the tab order: the selected one', () => {
        render(<Harness spans={plain} initial="t1" />)

        expect(tabbable()).toEqual([row('search, Completed')])
    })

    it('puts the nearest visible ancestor of a hidden selected row in the tab order', async () => {
        render(<Harness spans={delegation} initial="a3" />)

        await userEvent.click(
            row('ask_research, Completed').querySelector(
                '[data-slot="span-row-toggle"]',
            ) as Element,
        )

        expect(names()).toEqual([
            'Triage, Completed',
            'ask_research, Completed',
        ])
        expect(tabbable()).toEqual([row('ask_research, Completed')])
    })

    it('puts the first row in the tab order when nothing is selected', () => {
        render(<Harness spans={plain} initial="nope" />)

        expect(tabbable()).toEqual([row('SupportAssistant, Completed')])
    })

    it('moves focus with the arrows and selects nothing', async () => {
        const onSelect = vi.fn()
        render(<Harness spans={plain} onSelect={onSelect} />)
        row('SupportAssistant, Completed').focus()

        await userEvent.keyboard('{ArrowDown}')
        expect(row('Model step 1, Completed')).toHaveFocus()

        await userEvent.keyboard('{ArrowDown}{ArrowDown}')
        expect(row('Model step 2, Completed')).toHaveFocus()

        await userEvent.keyboard('{ArrowDown}')
        expect(row('Model step 2, Completed')).toHaveFocus()

        await userEvent.keyboard('{ArrowUp}')
        expect(row('search, Completed')).toHaveFocus()

        expect(onSelect).not.toHaveBeenCalled()
        expect(row('SupportAssistant, Completed')).toHaveAttribute(
            'aria-selected',
            'true',
        )
        expect(tabbable()).toEqual([row('SupportAssistant, Completed')])
    })

    it('stops at the first row on ArrowUp', async () => {
        render(<Harness spans={plain} />)
        row('SupportAssistant, Completed').focus()

        await userEvent.keyboard('{ArrowUp}')

        expect(row('SupportAssistant, Completed')).toHaveFocus()
    })

    it('jumps to the first and last visible rows with Home and End', async () => {
        render(<Harness spans={plain} />)
        row('search, Completed').focus()

        await userEvent.keyboard('{End}')
        expect(row('Model step 2, Completed')).toHaveFocus()

        await userEvent.keyboard('{Home}')
        expect(row('SupportAssistant, Completed')).toHaveFocus()
    })

    it('selects the focused row with Enter and with Space', async () => {
        const onSelect = vi.fn()
        render(<Harness spans={plain} onSelect={onSelect} />)

        row('search, Completed').focus()
        await userEvent.keyboard('{Enter}')
        expect(onSelect).toHaveBeenLastCalledWith('t1')

        row('Model step 2, Completed').focus()
        await userEvent.keyboard(' ')
        expect(onSelect).toHaveBeenLastCalledWith('s2')

        expect(row('Model step 2, Completed')).toHaveAttribute(
            'aria-selected',
            'true',
        )
        expect(onSelect).toHaveBeenCalledTimes(2)
    })

    it('collapses an expanded row with ArrowLeft, hiding its descendants, and keeps focus on it', async () => {
        render(<Harness spans={delegation} />)
        row('ask_research, Completed').focus()

        await userEvent.keyboard('{ArrowLeft}')

        expect(row('ask_research, Completed')).toHaveAttribute(
            'aria-expanded',
            'false',
        )
        expect(names()).toEqual([
            'Triage, Completed',
            'ask_research, Completed',
        ])
        expect(row('ask_research, Completed')).toHaveFocus()
    })

    it('moves to the parent with ArrowLeft on a collapsed row and on a leaf', async () => {
        render(<Harness spans={plain} />)
        row('search, Completed').focus()

        await userEvent.keyboard('{ArrowLeft}')

        expect(row('SupportAssistant, Completed')).toHaveFocus()

        // A top-level row has no parent to go to: nothing happens once it is collapsed.
        await userEvent.keyboard('{ArrowLeft}')
        expect(row('SupportAssistant, Completed')).toHaveAttribute(
            'aria-expanded',
            'false',
        )

        await userEvent.keyboard('{ArrowLeft}')
        expect(row('SupportAssistant, Completed')).toHaveFocus()
    })

    it('expands a collapsed row with ArrowRight, and moves to its first child when it is open', async () => {
        render(<Harness spans={plain} />)
        row('SupportAssistant, Completed').focus()
        await userEvent.keyboard('{ArrowLeft}')
        expect(rows()).toHaveLength(1)

        await userEvent.keyboard('{ArrowRight}')

        expect(rows()).toHaveLength(4)
        expect(row('SupportAssistant, Completed')).toHaveFocus()

        await userEvent.keyboard('{ArrowRight}')
        expect(row('Model step 1, Completed')).toHaveFocus()

        // A leaf has nowhere to go.
        await userEvent.keyboard('{ArrowRight}')
        expect(row('Model step 1, Completed')).toHaveFocus()
    })

    it('keeps the selection when the selected row is hidden by a collapse', async () => {
        render(<Harness spans={plain} initial="t1" />)
        row('SupportAssistant, Completed').focus()

        await userEvent.keyboard('{ArrowLeft}')

        expect(rows()).toHaveLength(1)
        expect(row('SupportAssistant, Completed')).toHaveAttribute(
            'aria-selected',
            'false',
        )

        await userEvent.keyboard('{ArrowRight}')

        expect(row('search, Completed')).toHaveAttribute(
            'aria-selected',
            'true',
        )
    })

    it('leaves other keys and chords to the browser', async () => {
        render(<Harness spans={plain} />)
        row('SupportAssistant, Completed').focus()

        await userEvent.keyboard('a')
        await userEvent.keyboard('{Control>}{ArrowDown}{/Control}')

        expect(row('SupportAssistant, Completed')).toHaveFocus()
    })
})
