import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appReady, renderApp } from '@/test/render-app'
import {
    makeAgentSpan,
    makeDetail,
    makeStepSpan,
    mockTraceApi,
} from '@/test/trace-api'

const id = '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30'

beforeEach(() => {
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'csrf-1',
    }
    mockTraceApi({
        [id]: makeDetail({
            trace: { id, status: 'completed' },
            spans: [
                makeAgentSpan('root', { sequence: 1 }),
                makeStepSpan('s1', {
                    sequence: 2,
                    parent_id: 'root',
                    step_number: 0,
                }),
            ],
        }),
    })
})

afterEach(() => {
    delete window.Trail
})

async function open(search = '') {
    renderApp(`/traces/${id}${search}`)
    await appReady()

    return screen.findByRole('tablist', { name: 'Run views' })
}

// The evidence panel has a tab called Metadata too: these are the page's own.
const tab = (name: string) =>
    within(screen.getByRole('tablist', { name: 'Run views' })).getByRole(
        'tab',
        { name },
    )
const params = () => new URLSearchParams(window.location.search)
const tree = () => screen.queryByRole('tree', { name: 'Execution tree' })

describe('the run views', () => {
    it('offers Execution, Usage and Metadata in that order, with Execution by default and out of the URL', async () => {
        await open()

        const list = within(screen.getByRole('tablist', { name: 'Run views' }))

        expect(list.getAllByRole('tab').map((t) => t.textContent)).toEqual([
            'Execution',
            'Usage',
            'Metadata',
        ])
        expect(tab('Execution')).toHaveAttribute('aria-selected', 'true')
        expect(tree()).toBeInTheDocument()
        expect(params().has('view')).toBe(false)
    })

    it.each([
        ['Usage', 'usage', { name: 'Tokens and cost' }],
        ['Metadata', 'metadata', { name: 'Recorded attributes' }],
    ])(
        'writes the %s view to the URL by replacing the entry',
        async (name, view, region) => {
            await open()
            const before = window.history.length

            await userEvent.click(tab(name))

            expect(params().get('view')).toBe(view)
            expect(window.history.length).toBe(before)
            expect(
                await screen.findByRole('region', region),
            ).toBeInTheDocument()
            expect(tab(name)).toHaveAttribute('aria-selected', 'true')
            expect(tree()).not.toBeInTheDocument()
        },
    )

    it('reads the view from the URL', async () => {
        await open('?view=metadata')

        expect(tab('Metadata')).toHaveAttribute('aria-selected', 'true')
        expect(
            await screen.findByRole('region', { name: 'Capture coverage' }),
        ).toBeInTheDocument()
    })

    it('follows the URL when it changes, as Back does', async () => {
        await open('?view=usage')

        expect(tab('Usage')).toHaveAttribute('aria-selected', 'true')

        act(() => {
            window.history.pushState({}, '', `/trail/traces/${id}`)
            window.dispatchEvent(new PopStateEvent('popstate'))
        })

        expect(tab('Execution')).toHaveAttribute('aria-selected', 'true')
        expect(tree()).toBeInTheDocument()
    })

    it('falls back to Execution for a view it does not know', async () => {
        await open('?view=nonsense')

        expect(tab('Execution')).toHaveAttribute('aria-selected', 'true')
        expect(tree()).toBeInTheDocument()
    })

    it('keeps the span and the evidence tab in the URL across view changes', async () => {
        await open('?span=s1&tab=raw')

        await userEvent.click(tab('Usage'))

        expect(params().get('view')).toBe('usage')
        expect(params().get('span')).toBe('s1')
        expect(params().get('tab')).toBe('raw')

        await userEvent.click(tab('Execution'))

        expect(params().has('view')).toBe(false)
        expect(params().get('span')).toBe('s1')
        expect(params().get('tab')).toBe('raw')
        expect(
            screen
                .getAllByRole('treeitem')
                .find((item) => item.getAttribute('aria-selected') === 'true'),
        ).toHaveAccessibleName(/Model step 1/)
    })

    it('keeps the tree as it was left when another view shows and back', async () => {
        await open()

        await userEvent.click(
            screen.getByRole('button', { name: 'Collapse all' }),
        )

        expect(
            screen.getByRole('button', { name: 'Expand all' }),
        ).toBeInTheDocument()

        await userEvent.click(tab('Usage'))

        expect(tree()).not.toBeInTheDocument()

        await userEvent.click(tab('Execution'))

        expect(
            await screen.findByRole('button', { name: 'Expand all' }),
        ).toBeInTheDocument()
    })

    it('moves between the views with the arrow keys', async () => {
        await open()

        act(() => tab('Execution').focus())
        await userEvent.keyboard('{ArrowRight}')

        expect(tab('Usage')).toHaveAttribute('aria-selected', 'true')
        expect(tab('Usage')).toHaveFocus()
        expect(params().get('view')).toBe('usage')

        await userEvent.keyboard('{ArrowRight}')

        expect(tab('Metadata')).toHaveAttribute('aria-selected', 'true')
        expect(params().get('view')).toBe('metadata')

        await userEvent.keyboard('{Home}')

        expect(tab('Execution')).toHaveAttribute('aria-selected', 'true')
        expect(params().has('view')).toBe(false)
    })

    it('hides the execution panel from everyone while another view shows', async () => {
        await open('?view=usage')

        const hiddenTree = screen.getByRole('tree', {
            name: 'Execution tree',
            hidden: true,
        })
        const panel = hiddenTree.closest('[role="tabpanel"]')

        expect(panel).toHaveAttribute('hidden')
        expect(hiddenTree).not.toBeVisible()
        // Out of the accessibility tree, so out of the Tab order too.
        expect(tree()).toBeNull()
        expect(screen.queryByRole('treeitem')).toBeNull()
        expect(screen.queryByRole('separator')).toBeNull()

        await userEvent.click(tab('Metadata'))

        expect(panel).toHaveAttribute('hidden')
        expect(tree()).toBeNull()
    })

    it('shows a split view of a sane size when Execution is opened after another view', async () => {
        await open('?view=usage')
        await userEvent.click(tab('Execution'))

        const divider = await screen.findByRole('separator', {
            name: 'Resize panes',
        })
        const now = Number(divider.getAttribute('aria-valuenow'))

        expect(Number.isFinite(now)).toBe(true)
        expect(now).toBeGreaterThanOrEqual(
            Number(divider.getAttribute('aria-valuemin')),
        )
        expect(now).toBeLessThanOrEqual(
            Number(divider.getAttribute('aria-valuemax')),
        )
        expect(tree()).toBeVisible()
    })
})
