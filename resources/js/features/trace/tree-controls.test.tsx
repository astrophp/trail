import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeAgentSpan, makeStepSpan, makeToolSpan } from '@/test/trace-api'
import { TreeHarness } from '@/test/tree-harness'
import { PaneHarness } from '@/test/pane-harness'
import { names, row, rows } from '@/test/tree-queries'

// A planner with two good spans, a failed tool and an incomplete step.
const run = [
    makeAgentSpan('root', { sequence: 1, name: 'Planner' }),
    makeStepSpan('s1', {
        sequence: 2,
        parent_id: 'root',
        step_number: 0,
        model: 'claude-sonnet-4-5',
    }),
    makeToolSpan('bad', {
        sequence: 3,
        parent_id: 'root',
        name: 'lookup',
        status: 'failed',
    }),
    makeStepSpan('s2', {
        sequence: 4,
        parent_id: 'root',
        step_number: 1,
        model: 'gpt-5',
        status: 'incomplete',
    }),
    makeToolSpan('ok', { sequence: 5, parent_id: 'root', name: 'search' }),
]

const everything = [
    'Planner, Completed',
    'Model step 1, Completed',
    'lookup, Failed',
    'Model step 2, Incomplete',
    'search, Completed',
]

const delegation = [
    makeAgentSpan('a1', { sequence: 1, name: 'Triage' }),
    makeToolSpan('t1', { sequence: 2, parent_id: 'a1', name: 'ask_research' }),
    makeAgentSpan('a2', { sequence: 3, parent_id: 't1', name: 'Research' }),
    makeToolSpan('t2', { sequence: 4, parent_id: 'a2', name: 'fetch' }),
    makeAgentSpan('a3', { sequence: 5, parent_id: 't2', name: 'Fetcher' }),
]

/** The visible words of the count of shown rows, from its live region. */
const shownCount = () =>
    screen
        .getByRole('status')
        .querySelector('[aria-hidden="true"]')
        ?.textContent?.trim()

const search = () => screen.getByRole('searchbox', { name: 'Search spans' })
const problemsOnly = () => screen.getByRole('button', { name: /Problems only/ })
const toggle = (item: HTMLElement) =>
    item.querySelector('[data-slot="span-row-toggle"]') as Element

describe('expand all and collapse all', () => {
    it('collapses everything while anything is open, and opens everything otherwise', async () => {
        render(<PaneHarness spans={delegation} />)

        expect(names()).toHaveLength(5)

        await userEvent.click(
            screen.getByRole('button', { name: 'Collapse all' }),
        )

        expect(names()).toEqual(['Triage, Completed'])
        expect(row('Triage, Completed')).toHaveAttribute(
            'aria-expanded',
            'false',
        )

        await userEvent.click(
            screen.getByRole('button', { name: 'Expand all' }),
        )

        expect(names()).toHaveLength(5)
        expect(
            screen.queryByRole('button', { name: 'Expand all' }),
        ).not.toBeInTheDocument()
    })

    it('still offers to collapse when only some rows are collapsed', async () => {
        render(<PaneHarness spans={delegation} />)

        await userEvent.click(toggle(row('ask_research, Completed')))

        expect(names()).toHaveLength(2)
        expect(
            screen.getByRole('button', { name: 'Collapse all' }),
        ).not.toHaveAttribute('aria-pressed')
    })

    it('opens and closes the attempt rows too', async () => {
        render(
            <PaneHarness
                spans={[
                    makeAgentSpan('root', { sequence: 1 }),
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

        await userEvent.click(toggle(row('Attempt 2 of 2')))
        expect(names()).toHaveLength(4)

        await userEvent.click(
            screen.getByRole('button', { name: 'Collapse all' }),
        )
        expect(names()).toHaveLength(1)

        await userEvent.click(
            screen.getByRole('button', { name: 'Expand all' }),
        )
        expect(names()).toHaveLength(5)
    })
})

describe('searching spans', () => {
    it('matches the title, ignoring case, and hides the rest', async () => {
        render(<PaneHarness spans={run} />)

        await userEvent.type(search(), 'LOOKUP')

        expect(names()).toEqual(['Planner, Completed', 'lookup, Failed'])
        expect(
            screen.queryByRole('treeitem', { name: /search/ }),
        ).not.toBeInTheDocument()
    })

    it('matches the words for the type of a span', async () => {
        render(<PaneHarness spans={run} />)

        await userEvent.type(search(), 'tool call')

        expect(names()).toEqual([
            'Planner, Completed',
            'lookup, Failed',
            'search, Completed',
        ])
    })

    it('matches a model', async () => {
        render(<PaneHarness spans={run} />)

        await userEvent.type(search(), 'GPT')

        expect(names()).toEqual([
            'Planner, Completed',
            'Model step 2, Incomplete',
        ])
    })

    it('keeps every ancestor of a match, however deep, open', async () => {
        render(<PaneHarness spans={delegation} />)

        await userEvent.click(toggle(row('Triage, Completed')))
        expect(names()).toEqual(['Triage, Completed'])

        await userEvent.type(search(), 'fetcher')

        expect(names()).toEqual([
            'Triage, Completed',
            'ask_research, Completed',
            'Research, Completed',
            'fetch, Completed',
            'Fetcher, Completed',
        ])
        expect(row('fetch, Completed')).toHaveAttribute('aria-expanded', 'true')
        expect(row('Fetcher, Completed')).not.toHaveAttribute('aria-expanded')
    })

    it('keeps the attempt row of a match', async () => {
        render(
            <PaneHarness
                spans={[
                    makeAgentSpan('root', { sequence: 1 }),
                    makeStepSpan('a', {
                        sequence: 2,
                        parent_id: 'root',
                        attempt: 1,
                        step_number: 0,
                    }),
                    makeStepSpan('b', {
                        sequence: 3,
                        parent_id: 'root',
                        attempt: 2,
                        step_number: 0,
                    }),
                    makeToolSpan('c', {
                        sequence: 4,
                        parent_id: 'root',
                        attempt: 2,
                        name: 'wanted',
                    }),
                ]}
            />,
        )

        await userEvent.type(search(), 'wanted')

        expect(names()).toEqual([
            'SupportAssistant, Completed',
            'Attempt 2 of 2',
            'wanted, Completed',
        ])
    })

    it('says so in words when nothing matches, and clears from there', async () => {
        render(<PaneHarness spans={run} />)

        await userEvent.type(search(), 'zzz')

        const empty = document.querySelector(
            '[data-slot="empty-state"]',
        ) as HTMLElement

        expect(
            within(empty).getByRole('heading', { name: 'No spans match' }),
        ).toBeInTheDocument()
        expect(screen.queryByRole('tree')).not.toBeInTheDocument()

        await userEvent.click(
            within(empty).getByRole('button', { name: 'Clear search' }),
        )

        expect(search()).toHaveValue('')
        expect(names()).toEqual(everything)
    })

    it('counts the rows that are shown beside the count of the run', async () => {
        render(<PaneHarness spans={run} />)

        expect(screen.getByText('5 spans')).toBeInTheDocument()
        expect(screen.getByRole('status')).toBeEmptyDOMElement()

        await userEvent.type(search(), 'lookup')

        expect(shownCount()).toBe('· 2 shown')
        expect(
            screen.getByText('2 spans shown, with the parents of matches'),
        ).toBeInTheDocument()

        await userEvent.click(
            screen.getByRole('button', { name: 'Clear search' }),
        )

        expect(screen.getByText('5 spans')).toBeInTheDocument()
    })

    it('counts only span rows, not attempt rows, as shown', async () => {
        render(
            <PaneHarness
                spans={[
                    makeAgentSpan('root', { sequence: 1 }),
                    makeStepSpan('a', {
                        sequence: 2,
                        parent_id: 'root',
                        attempt: 1,
                        step_number: 0,
                    }),
                    makeStepSpan('b', {
                        sequence: 3,
                        parent_id: 'root',
                        attempt: 2,
                        step_number: 0,
                    }),
                ]}
            />,
        )

        await userEvent.type(search(), 'step')

        expect(names()).toHaveLength(5)
        expect(shownCount()).toBe('· 3 shown')
    })
})

describe('the problems filter', () => {
    it('keeps failed and incomplete spans with their ancestors', async () => {
        render(<PaneHarness spans={run} />)

        await userEvent.click(problemsOnly())

        expect(problemsOnly()).toHaveAttribute('aria-pressed', 'true')
        expect(names()).toEqual([
            'Planner, Completed',
            'lookup, Failed',
            'Model step 2, Incomplete',
        ])
        expect(shownCount()).toBe('· 3 shown')
    })

    it('counts the problems of the run on the toggle', () => {
        render(<PaneHarness spans={run} />)

        expect(within(problemsOnly()).getByText('2')).toBeInTheDocument()
    })

    it('combines with a search by and', async () => {
        render(<PaneHarness spans={run} />)

        await userEvent.click(problemsOnly())
        await userEvent.type(search(), 'model')

        expect(names()).toEqual([
            'Planner, Completed',
            'Model step 2, Incomplete',
        ])

        await userEvent.clear(search())
        await userEvent.type(search(), 'search')

        // `search` is a span, but not a problem: nothing is left.
        expect(screen.queryByRole('tree')).not.toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Clear search and filter' }),
        ).toBeInTheDocument()
    })

    it('offers to clear the filter when only the filter leaves nothing', async () => {
        render(
            <PaneHarness
                spans={[
                    makeAgentSpan('root', { sequence: 1 }),
                    makeToolSpan('fine', { sequence: 2, parent_id: 'root' }),
                ]}
            />,
        )

        await userEvent.click(problemsOnly())

        expect(screen.queryByRole('tree')).not.toBeInTheDocument()

        await userEvent.click(
            screen.getByRole('button', { name: 'Clear filter' }),
        )

        expect(names()).toHaveLength(2)
        expect(problemsOnly()).toHaveAttribute('aria-pressed', 'false')
    })
})

describe('search and filter are view state', () => {
    it('leave the selection alone, hidden or not, and scroll it back into view when cleared', async () => {
        const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
        const onSelect = vi.fn()
        render(<PaneHarness spans={run} onSelect={onSelect} />)

        await userEvent.click(row('search, Completed'))
        onSelect.mockClear()
        scroll.mockClear()

        await userEvent.click(problemsOnly())

        expect(names()).toEqual([
            'Planner, Completed',
            'lookup, Failed',
            'Model step 2, Incomplete',
        ])
        expect(onSelect).not.toHaveBeenCalled()
        expect(scroll).not.toHaveBeenCalled()

        await userEvent.click(problemsOnly())

        expect(names()).toEqual(everything)
        expect(row('search, Completed')).toHaveAttribute(
            'aria-selected',
            'true',
        )
        expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'nearest' })
        expect(scroll.mock.contexts[0]).toBe(row('search, Completed'))
        // Focus stays where the person left it.
        expect(problemsOnly()).toHaveFocus()
        expect(onSelect).not.toHaveBeenCalled()

        scroll.mockRestore()
    })

    it('scroll the selection back after a search is cleared from the empty state too', async () => {
        const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
        render(<PaneHarness spans={run} />)

        await userEvent.type(search(), 'zzz')
        scroll.mockClear()
        await userEvent.click(
            within(
                document.querySelector(
                    '[data-slot="empty-state"]',
                ) as HTMLElement,
            ).getByRole('button', { name: 'Clear search' }),
        )

        expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
        expect(scroll.mock.contexts[0]).toBe(row('Planner, Completed'))

        scroll.mockRestore()
    })
})

describe('the tree by keyboard: problems', () => {
    it('moves to the next problem and selects it, wrapping round', async () => {
        const onSelect = vi.fn()
        render(<TreeHarness spans={run} onSelect={onSelect} />)
        row('Planner, Completed').focus()

        await userEvent.keyboard('e')
        expect(row('lookup, Failed')).toHaveFocus()
        expect(onSelect).toHaveBeenLastCalledWith('bad')
        expect(row('lookup, Failed')).toHaveAttribute('aria-selected', 'true')

        await userEvent.keyboard('e')
        expect(row('Model step 2, Incomplete')).toHaveFocus()
        expect(onSelect).toHaveBeenLastCalledWith('s2')

        await userEvent.keyboard('e')
        expect(row('lookup, Failed')).toHaveFocus()
    })

    it('moves to the previous problem with Shift+E, wrapping round', async () => {
        const onSelect = vi.fn()
        render(<TreeHarness spans={run} onSelect={onSelect} />)
        row('lookup, Failed').focus()

        await userEvent.keyboard('{Shift>}E{/Shift}')
        expect(row('Model step 2, Incomplete')).toHaveFocus()
        expect(onSelect).toHaveBeenLastCalledWith('s2')

        await userEvent.keyboard('{Shift>}E{/Shift}')
        expect(row('lookup, Failed')).toHaveFocus()
    })

    it('walks from an attempt row to the problem in the next attempt', async () => {
        render(
            <TreeHarness
                spans={[
                    makeAgentSpan('root', { sequence: 1 }),
                    makeStepSpan('a', {
                        sequence: 2,
                        parent_id: 'root',
                        attempt: 1,
                        step_number: 0,
                        status: 'failed',
                    }),
                    makeStepSpan('b', {
                        sequence: 3,
                        parent_id: 'root',
                        attempt: 2,
                        step_number: 0,
                    }),
                ]}
            />,
        )
        row('Attempt 2 of 2').focus()

        await userEvent.keyboard('e')

        expect(row('Model step 1, Failed')).toHaveFocus()
    })

    it('does nothing when there is no problem', async () => {
        const onSelect = vi.fn()
        render(
            <TreeHarness
                spans={[
                    makeAgentSpan('root', { sequence: 1 }),
                    makeStepSpan('s', { sequence: 2, parent_id: 'root' }),
                ]}
                onSelect={onSelect}
            />,
        )
        row('SupportAssistant, Completed').focus()

        await userEvent.keyboard('e')
        await userEvent.keyboard('{Shift>}E{/Shift}')

        expect(row('SupportAssistant, Completed')).toHaveFocus()
        expect(onSelect).not.toHaveBeenCalled()
    })

    it('ignores the key with ctrl, alt or meta held', async () => {
        const onSelect = vi.fn()
        render(<TreeHarness spans={run} onSelect={onSelect} />)
        row('Planner, Completed').focus()

        await userEvent.keyboard('{Control>}e{/Control}')
        await userEvent.keyboard('{Alt>}e{/Alt}')
        await userEvent.keyboard('{Meta>}e{/Meta}')

        expect(row('Planner, Completed')).toHaveFocus()
        expect(onSelect).not.toHaveBeenCalled()
    })

    it('is not taken from a person typing in the search field (which sits outside the tree), and acts on a row', async () => {
        const onSelect = vi.fn()
        render(<PaneHarness spans={run} onSelect={onSelect} />)

        await userEvent.type(search(), 'e')

        expect(search()).toHaveValue('e')
        expect(search()).toHaveFocus()
        expect(onSelect).not.toHaveBeenCalled()

        // The same key on a row of the tree does act.
        await userEvent.clear(search())
        row('Planner, Completed').focus()
        await userEvent.keyboard('e')

        expect(row('lookup, Failed')).toHaveFocus()
        expect(onSelect).toHaveBeenCalledExactlyOnceWith('bad')
    })

    it('goes through the problems that are shown while a search narrows the tree', async () => {
        render(<PaneHarness spans={run} />)

        await userEvent.type(search(), 'model')
        row('Planner, Completed').focus()
        await userEvent.keyboard('e')

        expect(row('Model step 2, Incomplete')).toHaveFocus()

        await userEvent.keyboard('e')

        // `lookup` is a problem, but hidden: the only one left is this one.
        expect(row('Model step 2, Incomplete')).toHaveFocus()
    })
})

describe('the tree by keyboard: opening siblings', () => {
    const siblings = [
        makeAgentSpan('root', { sequence: 1 }),
        makeToolSpan('t1', { sequence: 2, parent_id: 'root', name: 'first' }),
        makeAgentSpan('c1', { sequence: 3, parent_id: 't1', name: 'Child 1' }),
        makeToolSpan('t2', { sequence: 4, parent_id: 'root', name: 'second' }),
        makeAgentSpan('c2', { sequence: 5, parent_id: 't2', name: 'Child 2' }),
    ]

    it('opens every collapsed sibling of the focused row with *', async () => {
        render(<TreeHarness spans={siblings} />)

        await userEvent.click(toggle(row('first, Completed')))
        await userEvent.click(toggle(row('second, Completed')))
        expect(names()).toHaveLength(3)

        row('first, Completed').focus()
        await userEvent.keyboard('*')

        expect(names()).toHaveLength(5)
        expect(row('first, Completed')).toHaveFocus()
    })

    it('opens the row itself with its siblings, and nothing deeper', async () => {
        render(<TreeHarness spans={siblings} />)

        await userEvent.click(toggle(row('first, Completed')))
        await userEvent.click(toggle(row('SupportAssistant, Completed')))
        expect(names()).toEqual(['SupportAssistant, Completed'])

        row('SupportAssistant, Completed').focus()
        await userEvent.keyboard('*')

        // Its children are not its siblings: they stay as they were, one of them closed.
        expect(names()).toEqual([
            'SupportAssistant, Completed',
            'first, Completed',
            'second, Completed',
            'Child 2, Completed',
        ])
    })

    it('is ignored with ctrl held', async () => {
        render(<TreeHarness spans={siblings} />)

        await userEvent.click(toggle(row('first, Completed')))
        row('first, Completed').focus()
        await userEvent.keyboard('{Control>}*{/Control}')

        expect(row('first, Completed')).toHaveAttribute(
            'aria-expanded',
            'false',
        )
    })
})

describe('the keys of the tree are said', () => {
    it('in a hint under the tree, and in the description of the tree', () => {
        render(<PaneHarness spans={run} />)

        expect(screen.getByText(/e next problem/)).toBeInTheDocument()
        expect(screen.getByRole('tree')).toHaveAccessibleDescription(
            /e next problem.*Shift\+E previous problem.*\* open siblings/,
        )
        expect(rows()).toHaveLength(5)
    })
})

describe('expansion while a search or filter is on', () => {
    const nested = [
        makeAgentSpan('root', { sequence: 1 }),
        makeToolSpan('t1', { sequence: 2, parent_id: 'root', name: 'first' }),
        makeAgentSpan('c1', { sequence: 3, parent_id: 't1', name: 'Child 1' }),
        makeToolSpan('t2', { sequence: 4, parent_id: 'root', name: 'second' }),
        makeAgentSpan('c2', { sequence: 5, parent_id: 't2', name: 'Child 2' }),
    ]
    const chevrons = () =>
        document.querySelectorAll('[data-slot="span-row-toggle"] svg')

    it('disables the toolbar button, and says why in its name', async () => {
        render(<PaneHarness spans={nested} />)

        expect(
            screen.getByRole('button', { name: 'Collapse all' }),
        ).toHaveAttribute('aria-disabled', 'false')

        await userEvent.type(search(), 'child')

        const button = screen.getByRole('button', {
            name: 'Collapse all (unavailable while filtering)',
        })

        expect(button).toHaveAttribute('aria-disabled', 'true')
        expect(button).toHaveAttribute(
            'title',
            'Collapse all (unavailable while filtering)',
        )

        await userEvent.click(button)

        expect(names()).toHaveLength(5)
    })

    it('disables the button for the problems filter too', async () => {
        render(<PaneHarness spans={run} />)

        await userEvent.click(problemsOnly())

        expect(
            screen.getByRole('button', { name: /unavailable while filtering/ }),
        ).toHaveAttribute('aria-disabled', 'true')
    })

    it('shows no chevrons, and a click on where one was does nothing', async () => {
        render(<PaneHarness spans={nested} />)

        expect(chevrons().length).toBeGreaterThan(0)

        await userEvent.type(search(), 'child')

        expect(names()).toHaveLength(5)
        expect(chevrons()).toHaveLength(0)

        await userEvent.click(toggle(row('first, Completed')))

        expect(names()).toHaveLength(5)
        expect(row('first, Completed')).toHaveAttribute('aria-expanded', 'true')
    })

    it('lets ArrowLeft only move to the parent, and ArrowRight only to the first shown child', async () => {
        render(<PaneHarness spans={nested} />)

        await userEvent.type(search(), 'child')
        row('first, Completed').focus()

        await userEvent.keyboard('{ArrowRight}')
        expect(row('Child 1, Completed')).toHaveFocus()

        await userEvent.keyboard('{ArrowLeft}')
        expect(row('first, Completed')).toHaveFocus()
        expect(row('first, Completed')).toHaveAttribute('aria-expanded', 'true')

        await userEvent.keyboard('{ArrowLeft}')
        expect(row('SupportAssistant, Completed')).toHaveFocus()
        expect(names()).toHaveLength(5)
    })

    it('does nothing on * and writes nothing, so the collapsed rows come back as they were', async () => {
        render(<PaneHarness spans={nested} />)

        await userEvent.click(toggle(row('first, Completed')))
        await userEvent.click(toggle(row('second, Completed')))
        expect(names()).toHaveLength(3)

        await userEvent.type(search(), 'child')
        expect(names()).toHaveLength(5)

        row('first, Completed').focus()
        await userEvent.keyboard('*')
        await userEvent.keyboard('{ArrowLeft}')
        await userEvent.keyboard('{Enter}')
        expect(names()).toHaveLength(5)

        await userEvent.click(
            screen.getByRole('button', { name: 'Clear search' }),
        )

        expect(names()).toEqual([
            'SupportAssistant, Completed',
            'first, Completed',
            'second, Completed',
        ])
        expect(row('first, Completed')).toHaveAttribute(
            'aria-expanded',
            'false',
        )
        expect(row('second, Completed')).toHaveAttribute(
            'aria-expanded',
            'false',
        )
    })

    it('does not toggle an attempt row with Enter', async () => {
        render(
            <PaneHarness
                spans={[
                    makeAgentSpan('root', { sequence: 1 }),
                    makeStepSpan('a', {
                        sequence: 2,
                        parent_id: 'root',
                        attempt: 1,
                        step_number: 0,
                    }),
                    makeStepSpan('b', {
                        sequence: 3,
                        parent_id: 'root',
                        attempt: 2,
                        step_number: 0,
                    }),
                ]}
            />,
        )

        await userEvent.type(search(), 'step')
        row('Attempt 2 of 2').focus()
        await userEvent.keyboard('{Enter}')
        await userEvent.click(row('Attempt 2 of 2'))

        expect(names()).toHaveLength(5)
        expect(row('Attempt 2 of 2')).toHaveAttribute('aria-expanded', 'true')
    })
})

describe('the expand and collapse button when there is nothing to open', () => {
    it('is disabled for a run whose rows have nothing under them', () => {
        render(
            <PaneHarness
                spans={[makeToolSpan('only', { sequence: 1, name: 'only' })]}
            />,
        )

        const button = screen.getByRole('button', {
            name: /no rows have anything under them/,
        })

        expect(button).toHaveAttribute('aria-disabled', 'true')
    })
})

describe('the places of the rows shown', () => {
    it('count the rows shown under a parent, not the rows the run has', async () => {
        render(<PaneHarness spans={run} />)

        expect(row('lookup, Failed')).toHaveAttribute('aria-posinset', '2')
        expect(row('lookup, Failed')).toHaveAttribute('aria-setsize', '4')

        await userEvent.type(search(), 'lookup')

        expect(names()).toEqual(['Planner, Completed', 'lookup, Failed'])
        expect(row('lookup, Failed')).toHaveAttribute('aria-posinset', '1')
        expect(row('lookup, Failed')).toHaveAttribute('aria-setsize', '1')
        expect(row('Planner, Completed')).toHaveAttribute('aria-setsize', '1')
    })

    it('follow a collapse too', async () => {
        render(<PaneHarness spans={run} />)

        await userEvent.click(toggle(row('Planner, Completed')))

        expect(row('Planner, Completed')).toHaveAttribute('aria-setsize', '1')
        expect(names()).toHaveLength(1)
    })
})

describe('the problem keys across the whole run', () => {
    // The only problem is inside a delegate that is collapsed.
    const hidden = [
        makeAgentSpan('root', { sequence: 1 }),
        makeToolSpan('ask', { sequence: 2, parent_id: 'root', name: 'ask' }),
        makeAgentSpan('inner', {
            sequence: 3,
            parent_id: 'ask',
            name: 'Inner',
        }),
        makeToolSpan('bad', {
            sequence: 4,
            parent_id: 'inner',
            name: 'broken',
            status: 'failed',
        }),
        makeToolSpan('late', {
            sequence: 5,
            parent_id: 'root',
            name: 'late',
            status: 'incomplete',
        }),
    ]

    it('reaches a problem a collapsed row hides, and opens what hid it before focusing it', async () => {
        const onSelect = vi.fn()
        render(<PaneHarness spans={hidden} onSelect={onSelect} />)

        await userEvent.click(toggle(row('ask, Completed')))
        expect(
            screen.queryByRole('treeitem', { name: /broken/ }),
        ).not.toBeInTheDocument()
        expect(names()).toHaveLength(3)

        row('SupportAssistant, Completed').focus()
        await userEvent.keyboard('e')

        expect(row('broken, Failed')).toHaveFocus()
        expect(onSelect).toHaveBeenLastCalledWith('bad')
        expect(row('ask, Completed')).toHaveAttribute('aria-expanded', 'true')
        expect(row('Inner, Completed')).toHaveAttribute('aria-expanded', 'true')
    })

    it('reaches it backwards from the end too', async () => {
        render(<PaneHarness spans={hidden} />)

        await userEvent.click(toggle(row('ask, Completed')))
        row('late, Incomplete').focus()
        await userEvent.keyboard('{Shift>}E{/Shift}')

        expect(row('broken, Failed')).toHaveFocus()
    })

    it('takes the direction from Shift, not from the letter, so Caps Lock does not reverse it', () => {
        render(<TreeHarness spans={hidden} />)
        row('broken, Failed').focus()

        // Caps Lock on, Shift up: the key is an upper-case E and the direction is forward.
        fireEvent.keyDown(row('broken, Failed'), { key: 'E', shiftKey: false })
        expect(row('late, Incomplete')).toHaveFocus()

        // Caps Lock on, Shift down: a lower-case e, and the direction is backward.
        fireEvent.keyDown(row('late, Incomplete'), { key: 'e', shiftKey: true })
        expect(row('broken, Failed')).toHaveFocus()
    })

    it('stays among the rows shown while a search narrows the tree', async () => {
        render(<PaneHarness spans={hidden} />)

        await userEvent.type(search(), 'late')
        row('SupportAssistant, Completed').focus()
        await userEvent.keyboard('e')

        expect(row('late, Incomplete')).toHaveFocus()
        expect(
            screen.queryByRole('treeitem', { name: /broken/ }),
        ).not.toBeInTheDocument()
    })
})
