import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Agent } from '@/api/types'
import { forgetAttentionRefreshFailures } from '@/features/overview/use-attention'
import { forgetOverviewRefreshFailures } from '@/features/overview/use-overview'
import {
    agentFixture,
    agentWith,
    emptyAgents,
    listOf,
    type Handler,
} from '@/test/agents-api'
import { agentUrls, deferred, json, mockApi } from '@/test/overview-api'
import { renderApp } from '@/test/render-app'

beforeEach(() => {
    forgetOverviewRefreshFailures()
    forgetAttentionRefreshFailures()
})

const never = () => new Promise<Response>(() => {})

/** Five agents: the four of the fixture and one more. */
const five: Agent[] = [
    ...agentFixture.data,
    agentWith('SupportAssistant', { name: 'FifthAgent' }),
]

const fiveFor = (preset: '24h' | '7d' = '24h') =>
    json(listOf(five, { perPage: 5, preset }))

/**
 * The Overview's API with the agents list answered by whatever `answer` is at the time of the
 * request, so a test can change what the next request gets.
 */
function serve(first: Handler = (url) => fiveFor(rangeOf(url))) {
    const state = { answer: first }
    const fetchMock = mockApi(undefined, undefined, undefined, (url, init) =>
        state.answer(url, init),
    )

    return {
        fetchMock,
        answer: (next: Handler) => {
            state.answer = next
        },
    }
}

const rangeOf = (url: string) => (url.includes('range=7d') ? '7d' : '24h')

/** The panel, found by its heading. */
async function panel(): Promise<HTMLElement> {
    const heading = await screen.findByRole('heading', {
        name: 'Agent performance',
        level: 2,
    })
    const found = heading.closest('[data-slot="panel"]')

    if (!(found instanceof HTMLElement)) {
        throw new Error('The panel is not on the page.')
    }

    return found
}

/** The panel once its rows (or its empty answer) are in. */
async function open(route = '/') {
    renderApp(route)
    const found = await panel()

    await waitFor(() =>
        expect(found.querySelector('[data-slot="panel-loading"]')).toBeNull(),
    )

    return found
}

const rowsOf = (of: HTMLElement) => [...of.querySelectorAll('tbody tr')]
const linkTo = (of: HTMLElement) =>
    within(of).getByRole('link', { name: 'View agents' })
const follows = (a: Element, b: Element) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

async function pickRange(name: string) {
    await userEvent.click(screen.getByRole('combobox', { name: 'Time range' }))
    await userEvent.click(screen.getByRole('option', { name }))
}

describe('the agent performance panel', () => {
    it('asks for the five busiest agents of the range, with no search, and shows five rows', async () => {
        const { fetchMock } = serve()
        const of = await open()

        expect(agentUrls(fetchMock)).toEqual([
            '/trail/api/agents?range=24h&sort=-runs&page=1&per_page=5',
        ])
        expect(rowsOf(of)).toHaveLength(5)
    })

    it('has the table of the Agents page, whose rows lead to the agents', async () => {
        serve()
        const of = await open()

        expect(
            within(of)
                .getAllByRole('columnheader')
                .map((head) => head.textContent),
        ).toEqual([
            'Agent',
            'Runs',
            'Error rate',
            'Avg duration',
            'Est. cost',
            'Last activity',
            'Activity',
        ])
        expect(
            [...of.querySelectorAll('a[data-slot="row-link"]')].map((link) =>
                link.getAttribute('href'),
            ),
        ).toEqual(five.map((agent) => `/trail/agents/agent?name=${agent.name}`))
    })

    it('shows a sub-agent only row as the page does', async () => {
        serve()
        const of = await open()
        const row = within(of)
            .getByRole('link', { name: 'Summarizer' })
            .closest('tr')

        expect(row).toHaveTextContent('Sub-agent only')
        expect(row).toHaveTextContent('2 delegated runs')
        expect(row?.querySelectorAll('.sr-only')).not.toHaveLength(0)
    })

    it('has no pagination, no search, no count and no sorting of its own', async () => {
        serve()
        const of = await open()

        expect(
            within(of).queryByRole('navigation', { name: 'Pagination' }),
        ).not.toBeInTheDocument()
        expect(
            screen.queryByRole('searchbox', { name: 'Search agents' }),
        ).not.toBeInTheDocument()
        expect(within(of).queryByText(/^\d+ agents?$/)).not.toBeInTheDocument()
        // The only control in the panel is the link to the page.
        expect(within(of).queryByRole('button')).not.toBeInTheDocument()
        expect(
            within(of)
                .getAllByRole('columnheader')
                .some((head) => head.hasAttribute('aria-sort')),
        ).toBe(false)
    })

    it('has its title as a level 2 heading under the page’s one level 1, and a description', async () => {
        serve()
        const of = await open()

        expect(within(of).getByRole('heading')).toHaveTextContent(
            'Agent performance',
        )
        expect(within(of).getByRole('heading')).toHaveAttribute(
            'aria-level',
            '2',
        )
        expect(
            within(of).getByText(
                'The busiest agents by runs, with their error rate, speed and cost.',
            ),
        ).toBeVisible()
        expect(
            screen
                .getAllByRole('heading', { level: 1 })
                .map((h) => h.textContent),
        ).toEqual(['Overview'])
    })

    it('sits after what needs attention, and reads and tabs in that order, the link before the rows', async () => {
        serve()
        const of = await open()
        const attention = screen
            .getByRole('heading', { name: 'Needs attention' })
            .closest('[data-slot="panel"]') as HTMLElement

        expect(follows(attention, of)).toBe(true)
        expect(
            follows(
                within(attention).getByRole('link', { name: 'Failed runs' }),
                linkTo(of),
            ),
        ).toBe(true)
        expect(
            follows(
                linkTo(of),
                within(of).getByRole('link', { name: 'SupportAssistant' }),
            ),
        ).toBe(true)
    })
})

describe('the link to the agents', () => {
    it('leads to the Agents page', async () => {
        serve()
        const of = await open()

        expect(linkTo(of)).toHaveAttribute('href', '/trail/agents')
    })

    it('carries a range that is not the default, to the page and to every row', async () => {
        serve()
        const of = await open('/?range=7d')

        expect(linkTo(of)).toHaveAttribute('href', '/trail/agents?range=7d')
        expect(
            within(of)
                .getByRole('link', { name: 'SupportAssistant' })
                .getAttribute('href'),
        ).toBe('/trail/agents/agent?name=SupportAssistant&range=7d')
    })

    it('follows the range the rows were counted over, not the one asked for', async () => {
        const { answer } = serve()
        const of = await open('/?range=7d')
        const next = deferred()

        answer(() => next.promise)
        await pickRange('Last 24 hours')

        await waitFor(() =>
            expect(of.querySelector('table')).toHaveAttribute(
                'aria-busy',
                'true',
            ),
        )
        // The URL has moved to the default range; the rows on screen are still the 7 day ones.
        expect(window.location.search).toBe('')
        expect(linkTo(of)).toHaveAttribute('href', '/trail/agents?range=7d')

        next.resolve(
            new Response(
                JSON.stringify(listOf(five, { perPage: 5, preset: '24h' })),
            ),
        )

        await waitFor(() =>
            expect(linkTo(of)).toHaveAttribute('href', '/trail/agents'),
        )
        expect(of.querySelector('table')).not.toHaveAttribute('aria-busy')
    })
})

describe('while the agents load', () => {
    it('shows the panel’s loading state, and the rest of the page is there', async () => {
        serve(never)
        renderApp('/')
        const of = await panel()

        expect(of.querySelector('[data-slot="panel-loading"]')).toHaveAttribute(
            'aria-busy',
            'true',
        )
        expect(of.querySelector('table')).toBeNull()
        await screen.findByRole('link', { name: 'Failed runs' })
        expect(
            document.querySelector('[data-slot="metric-strip"]'),
        ).not.toBeNull()
    })

    it('keeps the previous range’s rows, dimmed and busy, while the next range loads', async () => {
        const { answer } = serve()
        const of = await open('/?range=1h')

        answer(never)
        await pickRange('Last 24 hours')

        await waitFor(() =>
            expect(of.querySelector('table')).toHaveAttribute(
                'aria-busy',
                'true',
            ),
        )
        expect(rowsOf(of)).toHaveLength(5)
        expect(of.querySelector('tbody')).toHaveClass('opacity-60')
        expect(within(of).getByRole('status')).toHaveTextContent('Loading')
    })

    it('does not dim or announce anything once the rows are current', async () => {
        serve()
        const of = await open()

        expect(of.querySelector('table')).not.toHaveAttribute('aria-busy')
        expect(of.querySelector('tbody')).not.toHaveClass('opacity-60')
        expect(within(of).getByRole('status')).toBeEmptyDOMElement()
    })

    it('does not claim a new range is empty because the previous one was', async () => {
        const { answer } = serve(() => json(emptyAgents))
        const of = await open('/?range=1h')

        expect(of).toHaveTextContent('No agents ran in this range')

        answer(never)
        await pickRange('Last 24 hours')

        await waitFor(() =>
            expect(
                of.querySelector('[data-slot="panel-loading"]'),
            ).not.toBeNull(),
        )
        expect(of).not.toHaveTextContent('No agents ran in this range')
    })
})

describe('when the agents cannot be loaded', () => {
    it('shows an error with a retry in the panel, and leaves the rest of the Overview as it is', async () => {
        serve(() => json({ message: 'Down.' }, 500))
        renderApp('/')
        const of = await panel()

        const alert = await within(of).findByRole('alert')

        expect(alert).toHaveTextContent('The agents could not be loaded')
        expect(alert).toHaveTextContent(
            'The server answered with an error (500).',
        )
        expect(of.querySelector('table')).toBeNull()
        // The other parts of the page are there, and none of them is an error.
        await screen.findByRole('link', { name: 'Failed runs' })
        expect(
            document.querySelector('[data-slot="metric-strip"]'),
        ).not.toBeNull()
        expect(screen.getAllByRole('alert')).toEqual([alert])
        expect(linkTo(of)).toBeVisible()
    })

    it('asks again when retried, and shows the rows', async () => {
        const { fetchMock, answer } = serve(() =>
            json({ message: 'Down.' }, 500),
        )
        renderApp('/')
        const of = await panel()

        await within(of).findByRole('alert')
        answer(() => fiveFor())

        const before = agentUrls(fetchMock).length

        await userEvent.click(
            within(of).getByRole('button', { name: 'Try again' }),
        )

        await waitFor(() => expect(rowsOf(of)).toHaveLength(5))
        expect(agentUrls(fetchMock)).toHaveLength(before + 1)
        expect(within(of).queryByRole('alert')).not.toBeInTheDocument()
    })

    it('does not carry the failure to another range', async () => {
        const { answer } = serve(() => json({ message: 'Down.' }, 500))
        renderApp('/')
        const of = await panel()

        await within(of).findByRole('alert')
        answer(never)
        await pickRange('Last 7 days')

        await waitFor(() =>
            expect(within(of).queryByRole('alert')).not.toBeInTheDocument(),
        )
        expect(of.querySelector('[data-slot="panel-loading"]')).not.toBeNull()
    })
})

describe('when no agent ran in the range', () => {
    it('says so in the panel, with the link to the page still there', async () => {
        serve(() => json(emptyAgents))
        const of = await open()

        expect(of).toHaveTextContent('No agents ran in this range')
        expect(of.querySelector('table')).toBeNull()
        expect(linkTo(of)).toBeVisible()
    })

    it('says nothing of the kind when there are agents', async () => {
        serve()
        const of = await open()

        expect(of).not.toHaveTextContent('No agents ran in this range')
        expect(of.querySelector('table')).not.toBeNull()
    })
})

describe('the refresh control', () => {
    it('asks for the agents again, like every other query', async () => {
        const { fetchMock } = serve()
        const of = await open()
        const before = agentUrls(fetchMock).length

        await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

        await waitFor(() =>
            expect(agentUrls(fetchMock)).toHaveLength(before + 1),
        )
        expect(rowsOf(of)).toHaveLength(5)
    })
})
