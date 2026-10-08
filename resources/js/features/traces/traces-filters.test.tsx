import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp, appReady } from '@/test/render-app'
import {
    agentSelect,
    bookmarkedToggle,
    chips,
    dataRows,
    emptyList,
    expectSearch,
    json,
    lastTraceUrl,
    listFor,
    loaded,
    metaFixture,
    mockApi,
    noChips,
    paramsOf,
    providerSelect,
    searchBox,
    tab,
    traceFixture,
    travel,
} from '@/test/traces-api'

beforeEach(() => {
    mockApi()
})

afterEach(() => {
    vi.useRealTimers()
})

/** Every filter in one URL. */
const everything =
    '?status=failed&search=refund&agent=SupportAssistant&provider=anthropic&bookmarked=1'

describe('the URL drives every filter', () => {
    it('selects the status tab, asks the API for it and shows its chip', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?status=failed')
        await loaded()

        expect(tab(/^Failed/)).toHaveAttribute('aria-selected', 'true')
        expect(tab(/^All traces/)).toHaveAttribute('aria-selected', 'false')
        expect(paramsOf(lastTraceUrl(fetchMock)).status).toBe('failed')
        expect(chips().getByText('Status: Failed')).toBeVisible()
    })

    it('fills the search box, asks the API for it and shows its chip', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?search=refund')
        await loaded()

        expect(searchBox()).toHaveValue('refund')
        expect(paramsOf(lastTraceUrl(fetchMock)).search).toBe('refund')
        expect(chips().getByText('Search: refund')).toBeVisible()
    })

    it('shows the agent, asks the API for it and shows its chip', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?agent=TicketTriage')
        await loaded()

        expect(agentSelect()).toHaveTextContent('TicketTriage')
        expect(providerSelect()).toHaveTextContent('All providers')
        expect(paramsOf(lastTraceUrl(fetchMock)).agent).toBe('TicketTriage')
        expect(chips().getByText('Agent: TicketTriage')).toBeVisible()
    })

    it('shows the provider, asks the API for it and shows its chip', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?provider=openai')
        await loaded()

        expect(providerSelect()).toHaveTextContent('openai')
        expect(agentSelect()).toHaveTextContent('All agents')
        expect(paramsOf(lastTraceUrl(fetchMock)).provider).toBe('openai')
        expect(chips().getByText('Provider: openai')).toBeVisible()
    })

    it('presses the Bookmarked toggle, asks the API for it and shows its chip', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?bookmarked=1')
        await loaded()

        expect(bookmarkedToggle()).toHaveAttribute('aria-pressed', 'true')
        expect(paramsOf(lastTraceUrl(fetchMock)).bookmarked).toBe('1')
        expect(chips().getByText('Bookmarked')).toBeVisible()
    })

    it('shows no chip and sends no filter for the default view', async () => {
        const fetchMock = mockApi()
        renderApp('/traces')
        await loaded()

        noChips()
        expect(bookmarkedToggle()).toHaveAttribute('aria-pressed', 'false')
        expect(tab(/^All traces/)).toHaveAttribute('aria-selected', 'true')
        expect(paramsOf(lastTraceUrl(fetchMock))).toEqual({
            range: '24h',
            sort: '-started_at',
            page: '1',
        })
    })

    it('applies all of them together', async () => {
        const fetchMock = mockApi()
        renderApp(`/traces${everything}&sort=-duration&range=7d`)
        await loaded()

        expect(paramsOf(lastTraceUrl(fetchMock))).toEqual({
            range: '7d',
            sort: '-duration',
            page: '1',
            status: 'failed',
            search: 'refund',
            agent: 'SupportAssistant',
            provider: 'anthropic',
            bookmarked: '1',
        })
        expect(tab(/^Failed/)).toHaveAttribute('aria-selected', 'true')
        expect(searchBox()).toHaveValue('refund')
        expect(agentSelect()).toHaveTextContent('SupportAssistant')
        expect(providerSelect()).toHaveTextContent('anthropic')
        expect(bookmarkedToggle()).toHaveAttribute('aria-pressed', 'true')
        expect(
            chips()
                .getAllByRole('listitem')
                .map((item) => item.textContent),
        ).toEqual([
            'Status: Failed',
            'Search: refund',
            'Agent: SupportAssistant',
            'Provider: anthropic',
            'Bookmarked',
        ])
    })

    it('falls back to all traces for a status it does not know', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?status=bogus')
        await loaded()

        expect(tab(/^All traces/)).toHaveAttribute('aria-selected', 'true')
        expect(paramsOf(lastTraceUrl(fetchMock))).not.toHaveProperty('status')
        noChips()
    })

    it('treats spaces around a search as nothing', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?search=%20%20')
        await loaded()

        expect(paramsOf(lastTraceUrl(fetchMock))).not.toHaveProperty('search')
        noChips()
    })
})

describe('the filters drive the URL', () => {
    it('chooses a status tab, returns to page 1, asks for it and keeps focus on the tab', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?page=2&sort=-duration')
        await loaded()

        await userEvent.click(tab(/^Failed/))

        await expectSearch('?sort=-duration&status=failed')
        await waitFor(() =>
            expect(paramsOf(lastTraceUrl(fetchMock))).toMatchObject({
                status: 'failed',
                page: '1',
                sort: '-duration',
            }),
        )
        expect(tab(/^Failed/)).toHaveFocus()
        expect(tab(/^Failed/)).toHaveAttribute('aria-selected', 'true')
    })

    it('does not choose a tab by moving to it with the arrow keys, only with Enter', async () => {
        renderApp('/traces')
        await loaded()

        tab(/^All traces/).focus()
        await userEvent.keyboard('{ArrowRight}')

        expect(tab(/^Completed/)).toHaveFocus()
        expect(window.location.search).toBe('')

        await userEvent.keyboard('{Enter}')
        await expectSearch('?status=completed')
    })

    it('chooses an agent, returns to page 1, asks for it and keeps focus on the select', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?page=2')
        await loaded()

        await userEvent.click(agentSelect())
        await userEvent.click(
            await screen.findByRole('option', { name: 'SupportAssistant' }),
        )

        await expectSearch('?agent=SupportAssistant')
        await waitFor(() =>
            expect(paramsOf(lastTraceUrl(fetchMock))).toMatchObject({
                agent: 'SupportAssistant',
                page: '1',
            }),
        )
        await waitFor(() => expect(agentSelect()).toHaveFocus())
    })

    it('chooses a provider, returns to page 1, asks for it and keeps focus on the select', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?page=2')
        await loaded()

        await userEvent.click(providerSelect())
        await userEvent.click(
            await screen.findByRole('option', { name: 'anthropic' }),
        )

        await expectSearch('?provider=anthropic')
        await waitFor(() =>
            expect(paramsOf(lastTraceUrl(fetchMock))).toMatchObject({
                provider: 'anthropic',
                page: '1',
            }),
        )
        await waitFor(() => expect(providerSelect()).toHaveFocus())
    })

    it('chooses "All agents" again to clear the agent', async () => {
        renderApp('/traces?agent=TicketTriage')
        await loaded()

        await userEvent.click(agentSelect())
        await userEvent.click(
            await screen.findByRole('option', { name: 'All agents' }),
        )

        await expectSearch('')
        noChips()
    })

    it('presses the Bookmarked toggle, returns to page 1, asks for it and keeps focus on the toggle', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?page=2')
        await loaded()

        await userEvent.click(bookmarkedToggle())

        await expectSearch('?bookmarked=1')
        await waitFor(() =>
            expect(paramsOf(lastTraceUrl(fetchMock))).toMatchObject({
                bookmarked: '1',
                page: '1',
            }),
        )
        expect(bookmarkedToggle()).toHaveFocus()
        expect(bookmarkedToggle()).toHaveAttribute('aria-pressed', 'true')

        await userEvent.click(bookmarkedToggle())
        await expectSearch('')
    })

    it('adds one history entry per change, so Back undoes it', async () => {
        renderApp('/traces?page=2')
        await loaded()

        const entries = window.history.length

        await userEvent.click(tab(/^Failed/))
        await expectSearch('?status=failed')
        expect(window.history.length).toBe(entries + 1)

        await travel('back')
        await expectSearch('?page=2')
        await waitFor(() =>
            expect(tab(/^All traces/)).toHaveAttribute('aria-selected', 'true'),
        )
    })

    it('keeps the other filters when one changes', async () => {
        renderApp(`/traces${everything}`)
        await loaded()

        await userEvent.click(tab(/^Completed/))

        await expectSearch(
            '?status=completed&search=refund&agent=SupportAssistant&provider=anthropic&bookmarked=1',
        )
    })
})

describe('the status tabs', () => {
    it('control the panel with the table, and the filter row sits between them, outside it', async () => {
        renderApp('/traces')
        await loaded()

        const selected = screen.getByRole('tab', { selected: true })
        const panel = document.getElementById(
            selected.getAttribute('aria-controls') ?? '',
        )

        expect(panel).toBe(screen.getByRole('tabpanel'))
        expect(panel).toContainElement(screen.getByRole('table'))
        expect(panel).not.toContainElement(searchBox())

        const list = screen.getByRole('tablist')

        // Tab list, then the filter row, then the panel.
        expect(
            list.compareDocumentPosition(searchBox()) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy()
        expect(
            searchBox().compareDocumentPosition(panel as HTMLElement) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy()
    })

    const counts = traceFixture.status_counts

    it('shows the API’s count on each tab, in order', async () => {
        mockApi()
        renderApp('/traces')
        await loaded()

        expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
            `All traces ${counts.all}`,
            `Completed ${counts.completed}`,
            `Failed ${counts.failed}`,
            `Incomplete ${counts.incomplete}`,
            `Running ${counts.running}`,
            `Awaiting approval ${counts.awaiting_approval}`,
        ])
    })

    it('shows no count, and no zero, until the first response', async () => {
        mockApi(() => new Promise<Response>(() => {}))
        renderApp('/traces')
        await appReady()

        expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
            'All traces',
            'Completed',
            'Failed',
            'Incomplete',
            'Running',
            'Awaiting approval',
        ])
        expect(
            document.querySelector('[data-slot="count-chip"]'),
        ).not.toBeInTheDocument()
    })

    it('keeps the previous counts while a refresh loads, then shows the new ones', async () => {
        let release: (response: Response) => void = () => {}
        const fetchMock = mockApi((url) =>
            url.includes('status=failed')
                ? new Promise<Response>((done) => {
                      release = done
                  })
                : json(listFor(url)),
        )
        renderApp('/traces')
        await loaded()

        await userEvent.click(tab(/^Failed/))
        await waitFor(() =>
            expect(paramsOf(lastTraceUrl(fetchMock)).status).toBe('failed'),
        )

        expect(tab(/^All traces/)).toHaveTextContent(`${counts.all}`)
        expect(tab(/^Failed/)).toHaveTextContent(`${counts.failed}`)

        act(() => {
            release(
                new Response(
                    JSON.stringify({
                        ...listFor('?'),
                        status_counts: { ...counts, all: 3, failed: 1 },
                    }),
                ),
            )
        })

        await waitFor(() =>
            expect(tab(/^All traces/)).toHaveTextContent('All traces 3'),
        )
    })
})

describe('the chips', () => {
    it('removes one filter, clears only its parameter and returns to page 1', async () => {
        renderApp(`/traces${everything}&page=2&sort=-duration&range=7d`)
        await loaded()

        await userEvent.click(
            screen.getByRole('button', {
                name: 'Remove filter: Agent: SupportAssistant',
            }),
        )

        await expectSearch(
            '?range=7d&sort=-duration&status=failed&search=refund&provider=anthropic&bookmarked=1',
        )
        expect(agentSelect()).toHaveTextContent('All agents')
        expect(
            chips()
                .getAllByRole('listitem')
                .map((item) => item.textContent),
        ).not.toContain('Agent: SupportAssistant')
    })

    it.each([
        ['Status: Failed', 'search=refund&agent=SupportAssistant'],
        ['Search: refund', 'status=failed&agent=SupportAssistant'],
        ['Provider: anthropic', 'status=failed&search=refund'],
        ['Bookmarked', 'status=failed&search=refund'],
    ])('removes the "%s" chip alone', async (label, rest) => {
        renderApp(
            '/traces?status=failed&search=refund&agent=SupportAssistant&provider=anthropic&bookmarked=1',
        )
        await loaded()

        await userEvent.click(
            screen.getByRole('button', { name: `Remove filter: ${label}` }),
        )

        await waitFor(() =>
            expect(chips().queryByText(label)).not.toBeInTheDocument(),
        )
        expect(window.location.search).toContain(rest)
        expect(window.location.search).not.toContain('page')
    })

    it('clears every filter with "Clear all" and keeps the sort and the range', async () => {
        renderApp(`/traces${everything}&page=2&sort=-duration&range=7d`)
        await loaded()

        await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))

        await expectSearch('?range=7d&sort=-duration')
        noChips()
        expect(searchBox()).toHaveValue('')
        expect(tab(/^All traces/)).toHaveAttribute('aria-selected', 'true')
    })

    it('moves focus to the search box when the last chip is removed', async () => {
        renderApp('/traces?bookmarked=1')
        await loaded()

        await userEvent.click(
            screen.getByRole('button', { name: 'Remove filter: Bookmarked' }),
        )

        await expectSearch('')
        await waitFor(() => expect(searchBox()).toHaveFocus())
    })

    it('moves focus to the search box after "Clear all"', async () => {
        renderApp(`/traces${everything}`)
        await loaded()

        await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))

        await waitFor(() => expect(searchBox()).toHaveFocus())
    })
})

describe('the agent and provider options', () => {
    it('lists the agents and providers the meta endpoint saw in the range', async () => {
        mockApi()
        renderApp('/traces')
        await loaded()

        await userEvent.click(agentSelect())
        expect(
            (await screen.findAllByRole('option')).map((o) => o.textContent),
        ).toEqual(['All agents', ...metaFixture.data.filters.agents])
        await userEvent.keyboard('{Escape}')

        await userEvent.click(providerSelect())
        expect(
            (await screen.findAllByRole('option')).map((o) => o.textContent),
        ).toEqual(['All providers', ...metaFixture.data.filters.providers])
    })

    it('shows a value from the URL that is not among the options', async () => {
        renderApp('/traces?agent=Ghost&provider=elsewhere')
        await loaded()

        expect(agentSelect()).toHaveTextContent('Ghost')
        expect(providerSelect()).toHaveTextContent('elsewhere')
    })

    it('shows the URL’s value and still works while the options are missing', async () => {
        const fetchMock = mockApi()
        fetchMock.mockImplementation((url) =>
            url.includes('/api/meta')
                ? json({ message: 'Broken.' }, 500)
                : json(listFor(url)),
        )
        renderApp('/traces?agent=Ghost')
        await loaded()

        expect(agentSelect()).toHaveTextContent('Ghost')

        await userEvent.click(providerSelect())
        expect(
            (await screen.findAllByRole('option')).map((o) => o.textContent),
        ).toEqual(['All providers'])
    })
})

describe('the states with filters', () => {
    it('says no runs match when filters hide every run, and "Clear filters" shows them again', async () => {
        const fetchMock = mockApi((url) =>
            url.includes('search=zzz') ? json(emptyList) : json(listFor(url)),
        )
        renderApp('/traces?search=zzz&sort=-duration')

        const heading = await screen.findByRole('heading', {
            name: 'No runs match these filters',
        })
        const card = heading.closest('[data-slot="data-table"]') as HTMLElement

        expect(
            within(card).getByText(
                'Try removing a filter or searching for something else.',
            ),
        ).toBeVisible()
        expect(
            screen.queryByRole('navigation', { name: 'Pagination' }),
        ).not.toBeInTheDocument()
        expect(screen.queryByText('No runs found')).not.toBeInTheDocument()
        // The ways out stay on screen.
        expect(searchBox()).toHaveValue('zzz')
        expect(tab(/^All traces/)).toBeVisible()
        expect(chips().getByText('Search: zzz')).toBeVisible()

        await userEvent.click(
            screen.getByRole('button', { name: 'Clear filters' }),
        )

        await expectSearch('?sort=-duration')
        await waitFor(() =>
            expect(dataRows()).toHaveLength(traceFixture.data.length),
        )
        expect(paramsOf(lastTraceUrl(fetchMock))).not.toHaveProperty('search')
        // The button went away with the state: focus is where "Clear all" leaves it.
        expect(searchBox()).toHaveFocus()
    })

    it('keeps the "No runs found" state, without an action, when there are no filters', async () => {
        mockApi(() => json(emptyList))
        renderApp('/traces')

        await screen.findByRole('heading', { name: 'No runs found' })

        expect(
            screen.queryByRole('button', { name: 'Clear filters' }),
        ).not.toBeInTheDocument()
        expect(
            screen.getByText('Runs appear here as your agents run.'),
        ).toBeVisible()
        expect(searchBox()).toBeVisible()
        expect(screen.getAllByRole('tab')).toHaveLength(6)
    })

    it('shows the tabs and the filter row while the first load runs', async () => {
        mockApi(() => new Promise<Response>(() => {}))
        renderApp('/traces?agent=Ghost')
        await appReady()

        expect(screen.getByRole('tablist')).toBeVisible()
        expect(searchBox()).toBeVisible()
        expect(agentSelect()).toHaveTextContent('Ghost')
        expect(bookmarkedToggle()).toBeVisible()
        expect(chips().getByText('Agent: Ghost')).toBeVisible()
        expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
    })

    it('shows the tabs and the filter row beside an error, and leaves it through a filter', async () => {
        mockApi((url) =>
            url.includes('status=failed')
                ? json({ message: 'Down.' }, 500)
                : json(listFor(url)),
        )
        renderApp('/traces?status=failed&search=refund')

        await screen.findByRole('alert')

        expect(screen.getByRole('tablist')).toBeVisible()
        expect(searchBox()).toHaveValue('refund')
        expect(chips().getByText('Status: Failed')).toBeVisible()
        expect(
            document.querySelector('[data-slot="count-chip"]'),
        ).not.toBeInTheDocument()

        await userEvent.click(tab(/^All traces/))

        await loaded()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('does not carry a failure over to a view with other filters', async () => {
        let fail = true
        mockApi((url) =>
            fail && url.includes('agent=Ghost')
                ? json({ message: 'Down.' }, 500)
                : json(listFor(url)),
        )
        renderApp('/traces?agent=Ghost')
        await screen.findByRole('alert')

        fail = false
        await userEvent.click(
            screen.getByRole('button', { name: 'Remove filter: Agent: Ghost' }),
        )

        await loaded()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
})

describe('the conversation filter', () => {
    const id = 'support/ada 1042'
    const encoded = 'support%2Fada+1042'

    it('reads the conversation from the URL, asks the API for it and shows its chip', async () => {
        const fetchMock = mockApi()
        renderApp(`/traces?conversation=${encoded}`)
        await loaded()

        expect(paramsOf(lastTraceUrl(fetchMock)).conversation).toBe(id)
        expect(chips().getByText(`Conversation: ${id}`)).toBeVisible()
    })

    it('shortens a long id in the chip, as the conversation page does', async () => {
        const long = 'conversation-with-a-very-long-id-0123456789'

        renderApp(`/traces?conversation=${long}`)
        await loaded()

        expect(chips().getByText('Conversation: conversa…6789')).toBeVisible()
        expect(chips().queryByText(`Conversation: ${long}`)).toBeNull()
    })

    it('sends no conversation without one in the URL, and none for an empty one', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?conversation=')
        await loaded()

        expect(paramsOf(lastTraceUrl(fetchMock))).not.toHaveProperty(
            'conversation',
        )
        noChips()
    })

    it('combines with the other filters', async () => {
        const fetchMock = mockApi()
        renderApp(`/traces?status=failed&conversation=${encoded}`)
        await loaded()

        expect(paramsOf(lastTraceUrl(fetchMock))).toMatchObject({
            status: 'failed',
            conversation: id,
        })
    })

    it('removes the filter with its chip, back on page 1, in one history entry', async () => {
        const fetchMock = mockApi()
        renderApp(`/traces?conversation=${encoded}&page=2&sort=-duration`)
        await loaded()

        const entries = window.history.length

        await userEvent.click(
            screen.getByRole('button', {
                name: `Remove filter: Conversation: ${id}`,
            }),
        )

        await expectSearch('?sort=-duration')
        expect(window.history.length).toBe(entries + 1)
        await waitFor(() =>
            expect(paramsOf(lastTraceUrl(fetchMock))).not.toHaveProperty(
                'conversation',
            ),
        )
        expect(paramsOf(lastTraceUrl(fetchMock)).page).toBe('1')
        noChips()

        await travel('back')
        await expectSearch(`?conversation=${encoded}&page=2&sort=-duration`)
        expect(chips().getByText(`Conversation: ${id}`)).toBeVisible()
    })

    it('is cleared by "Clear all" with the others', async () => {
        renderApp(`/traces?status=failed&conversation=${encoded}&range=7d`)
        await loaded()

        await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))

        await expectSearch('?range=7d')
        noChips()
    })

    it('is part of the CSV export of the view', async () => {
        renderApp(`/traces?conversation=${encoded}`)
        await loaded()

        const href =
            screen.getByRole('link', { name: /Export/ }).getAttribute('href') ??
            ''

        expect(new URL(href, 'http://x').searchParams.get('conversation')).toBe(
            id,
        )
    })
})
