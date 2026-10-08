import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appReady, renderApp } from '@/test/render-app'
import {
    makeAgentSpan,
    makeDetail,
    makeStepSpan,
    makeToolSpan,
    mockTraceApi,
} from '@/test/trace-api'

const id = '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30'

beforeEach(() => {
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'csrf-1',
    }
})

afterEach(() => {
    delete window.Trail
})

// A run that failed over: the first attempt hit a rate limit, the second answered.
const failover = [
    makeAgentSpan('root', { sequence: 1 }),
    makeStepSpan('first', {
        sequence: 2,
        parent_id: 'root',
        attempt: 1,
        step_number: 0,
        status: 'failed',
        issue_kind: 'rate_limited',
        error: {
            class: 'RateLimitedException',
            message: 'Slow down',
            source: 'step',
            http_status: 429,
        },
    }),
    makeStepSpan('second', {
        sequence: 3,
        parent_id: 'root',
        attempt: 2,
        step_number: 0,
    }),
    makeToolSpan('tool', {
        sequence: 4,
        parent_id: 'root',
        attempt: 2,
        name: 'lookup',
    }),
]

async function open(
    spans = failover,
    search = '',
    trace: Parameters<typeof makeDetail>[0]['trace'] = {},
) {
    mockTraceApi({ [id]: makeDetail({ trace: { id, ...trace }, spans }) })
    renderApp(`/traces/${id}${search}`)
    await appReady()
    await screen.findByRole('tree', { name: 'Execution tree' })
}

const selected = () =>
    screen
        .getAllByRole('treeitem')
        .filter((item) => item.getAttribute('aria-selected') === 'true')
        .map((item) => item.getAttribute('aria-label'))

const evidenceTitle = () =>
    document.querySelector('[data-slot="span-header"]') as HTMLElement

describe('attempt rows on the trace page', () => {
    it('are skipped when the failed run picks the span to show first', async () => {
        await open(failover, '', { status: 'failed' })

        expect(selected()).toEqual(['Model step 1, Failed'])
        expect(
            screen.getByRole('treeitem', { name: 'Attempt 1 of 2' }),
        ).not.toHaveAttribute('aria-selected')
    })

    it('cannot be put in the URL: the id of one falls back to the run', async () => {
        await open(failover, '?span=attempt:root:1', { status: 'completed' })

        expect(selected()).toEqual(['SupportAssistant, Completed'])
        expect(
            within(evidenceTitle()).getByText('SupportAssistant'),
        ).toBeInTheDocument()
    })

    it('are not part of the ancestors above a span in the evidence', async () => {
        await open(failover, '?span=tool')

        const ancestors = screen.getByRole('navigation', {
            name: 'Span ancestors',
        })

        expect(
            within(ancestors)
                .getAllByRole('button')
                .map((button) => button.textContent),
        ).toEqual(['SupportAssistant'])
        expect(ancestors).not.toHaveTextContent(/Attempt/)
    })

    it('select the failed span from the button on a failed attempt, and write it to the URL', async () => {
        await open(failover)

        await userEvent.click(
            screen.getByRole('button', { name: /Show failure of attempt 1/ }),
        )

        await waitFor(() => expect(window.location.search).toBe('?span=first'))
        expect(selected()).toEqual(['Model step 1, Failed'])
    })

    it('show the issue and the message of the failure on the row', async () => {
        await open(failover)

        const attempt = screen.getByRole('treeitem', {
            name: 'Attempt 1 of 2',
        })

        expect(within(attempt).getByText('Rate limited')).toBeInTheDocument()
        expect(within(attempt).getByText('Slow down')).toHaveAttribute(
            'title',
            'Slow down',
        )
    })
})

describe('searching and filtering on the trace page', () => {
    it('never changes the span in the URL, nor what the evidence shows', async () => {
        await open(failover, '?span=tool')

        await userEvent.type(
            screen.getByRole('searchbox', { name: 'Search spans' }),
            'model step 1',
        )

        // The remaining rows first; then what is gone.
        expect(
            screen
                .getAllByRole('treeitem')
                .map((item) => item.getAttribute('aria-label')),
        ).toEqual([
            'SupportAssistant, Completed',
            'Attempt 1 of 2',
            'Model step 1, Failed',
            'Attempt 2 of 2',
            'Model step 1, Completed',
        ])
        expect(
            screen.queryByRole('treeitem', { name: /lookup/ }),
        ).not.toBeInTheDocument()
        expect(window.location.search).toBe('?span=tool')
        expect(within(evidenceTitle()).getByText('lookup')).toBeInTheDocument()

        await userEvent.click(
            screen.getByRole('button', { name: /Problems only/ }),
        )

        expect(window.location.search).toBe('?span=tool')
        expect(within(evidenceTitle()).getByText('lookup')).toBeInTheDocument()

        await userEvent.click(
            screen.getByRole('button', { name: 'Clear search' }),
        )
        await userEvent.click(
            screen.getByRole('button', { name: /Problems only/ }),
        )

        expect(selected()).toEqual(['lookup, Completed'])
        expect(window.location.search).toBe('?span=tool')
    })

    it('keeps the run count and adds the rows shown', async () => {
        await open(failover)

        await userEvent.type(
            screen.getByRole('searchbox', { name: 'Search spans' }),
            'model step',
        )

        expect(
            screen.getByText('3 spans shown, with the parents of matches'),
        ).toBeInTheDocument()
    })
})
