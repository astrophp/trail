import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { TimeRangePreset } from '@/lib/time-range'
import { appReady, renderApp } from '@/test/render-app'
import {
    agentFixture,
    agentUrls,
    answerWith,
    dataRows,
    deferred,
    emptyAgents,
    expectSearch,
    header,
    json,
    lastAgentUrl,
    listOf,
    loaded,
    mockApi,
    paramsOf,
    searchBox,
    sortButton,
    travel,
} from '@/test/agents-api'

const never = () => new Promise<Response>(() => {})
const table = () =>
    screen.getByRole('table', { name: 'Agents that ran in the selected range' })
const nextButton = () => screen.getByRole('button', { name: 'Next page' })
const pickRange = async (name: string) => {
    await userEvent.click(screen.getByRole('combobox', { name: 'Time range' }))
    await userEvent.click(screen.getByRole('option', { name }))
}
const footnote = () =>
    screen.queryByText(/^An agent’s own runs and its runs as a sub-agent/)

/** Three pages of the fixture's agents, the page being the URL's. */
const sixty = (url: string) =>
    json(
        listOf(agentFixture.data, {
            page: Number(paramsOf(url).page ?? 1),
            total: 60,
            preset: (paramsOf(url).range ?? '24h') as TimeRangePreset,
        }),
    )

beforeEach(() => {
    mockApi()
})

describe('the Agents page', () => {
    it('asks for the default view explicitly and renders a row per agent', async () => {
        const fetchMock = mockApi()
        renderApp('/agents')
        await loaded()

        expect(agentUrls(fetchMock)).toEqual([
            '/trail/api/agents?range=24h&sort=-runs&page=1',
        ])
        expect(dataRows()).toHaveLength(agentFixture.data.length)
        expect(
            screen.getByRole('heading', { level: 1, name: 'Agents' }),
        ).toBeInTheDocument()
        expect(
            screen.getByText(
                'Agents are discovered from recorded runs: how often each ran, how reliably, how fast and at what cost.',
            ),
        ).toBeVisible()
        expect(document.title).toBe('Agents · Trail')
        expect(
            screen.getByRole('combobox', { name: 'Time range' }),
        ).toHaveTextContent('Last 24 hours')
    })

    it('has the seven columns in order, sortable only where the API sorts', async () => {
        renderApp('/agents')
        await loaded()

        const headers = within(table()).getAllByRole('columnheader')

        expect(headers.map((h) => h.textContent)).toEqual([
            'Agent',
            'Runs',
            'Error rate',
            'Avg duration',
            'Est. cost',
            'Last activity',
            'Activity',
        ])
        expect(
            headers
                .filter((h) => h.getAttribute('aria-sort') !== null)
                .map((h) => h.textContent),
        ).toEqual([
            'Agent',
            'Runs',
            'Error rate',
            'Avg duration',
            'Est. cost',
            'Last activity',
        ])
    })

    it('has one level-1 heading and no skipped level', async () => {
        renderApp('/agents')
        await loaded()

        expect(
            screen
                .getAllByRole('heading')
                .map(
                    (heading) =>
                        heading.getAttribute('aria-level') ?? heading.tagName,
                ),
        ).toEqual(['H1'])
    })

    it('explains the two counts under the table once there are rows', async () => {
        renderApp('/agents')
        await loaded()

        expect(footnote()).toBeVisible()
        expect(footnote()).toHaveTextContent(
            'Error rate, duration and cost cover its own runs only.',
        )
    })
})

describe('the count of agents', () => {
    it('is the total of the answer', async () => {
        mockApi(sixty)
        renderApp('/agents')
        await loaded()

        expect(screen.getByText('60 agents')).toBeVisible()
    })

    it('is in the singular for one', async () => {
        mockApi(() => json(listOf([agentFixture.data[0]])))
        renderApp('/agents')
        await loaded()

        expect(screen.getByText('1 agent')).toBeVisible()
    })

    it('is not shown before the first answer', async () => {
        mockApi(never)
        renderApp('/agents')
        await appReady()

        expect(screen.queryByText(/^\d+ agents?$/)).not.toBeInTheDocument()
    })

    it('is not shown from the previous view while the next one loads', async () => {
        const fetchMock = mockApi(sixty)
        renderApp('/agents')
        await loaded()
        expect(screen.getByText('60 agents')).toBeVisible()

        answerWith(fetchMock, never)
        await userEvent.click(nextButton())

        await waitFor(() =>
            expect(table()).toHaveAttribute('aria-busy', 'true'),
        )
        expect(screen.queryByText('60 agents')).not.toBeInTheDocument()
    })
})

describe('the URL drives the view', () => {
    it('requests what the URL says and marks the sorted column', async () => {
        const fetchMock = mockApi(sixty)
        renderApp('/agents?sort=-cost&page=2&range=7d&search=support')
        await loaded()

        expect(agentUrls(fetchMock)).toEqual([
            '/trail/api/agents?range=7d&sort=-cost&page=2&search=support',
        ])
        expect(header(/Est\. cost/)).toHaveAttribute('aria-sort', 'descending')
        expect(header(/Runs/)).toHaveAttribute('aria-sort', 'none')
        expect(screen.getByText('Page 2 of 3')).toBeVisible()
        expect(
            screen.getByRole('combobox', { name: 'Time range' }),
        ).toHaveTextContent('Last 7 days')
        expect(searchBox()).toHaveValue('support')
    })

    it.each([
        ['name', /^Agent/, 'ascending'],
        ['-name', /^Agent/, 'descending'],
        ['runs', /Runs/, 'ascending'],
        ['-runs', /Runs/, 'descending'],
        ['error_rate', /Error rate/, 'ascending'],
        ['-error_rate', /Error rate/, 'descending'],
        ['duration', /Avg duration/, 'ascending'],
        ['-duration', /Avg duration/, 'descending'],
        ['cost', /Est\. cost/, 'ascending'],
        ['-cost', /Est\. cost/, 'descending'],
        ['last_activity', /Last activity/, 'ascending'],
        ['-last_activity', /Last activity/, 'descending'],
    ] as const)(
        'marks the column of ?sort=%s',
        async (sort, name, direction) => {
            const fetchMock = mockApi()
            renderApp(`/agents?sort=${sort}`)
            await loaded()

            expect(header(name)).toHaveAttribute('aria-sort', direction)
            expect(paramsOf(lastAgentUrl(fetchMock)).sort).toBe(sort)
        },
    )

    it('is busiest first by default', async () => {
        renderApp('/agents')
        await loaded()

        expect(header(/Runs/)).toHaveAttribute('aria-sort', 'descending')
    })

    it('falls back to the defaults for an invalid sort, page or range', async () => {
        const fetchMock = mockApi()
        renderApp('/agents?sort=bogus&page=0&range=forever')
        await loaded()

        expect(agentUrls(fetchMock)).toEqual([
            '/trail/api/agents?range=24h&sort=-runs&page=1',
        ])
    })
})

describe('the view drives the URL', () => {
    it.each([
        [/^Agent/, '?sort=name'],
        // The default sort is busiest first, so the first click on Runs flips it.
        [/Runs/, '?sort=runs'],
        [/Error rate/, '?sort=-error_rate'],
        [/Avg duration/, '?sort=-duration'],
        [/Est\. cost/, '?sort=-cost'],
        [/Last activity/, '?sort=-last_activity'],
    ])(
        'sorts %s with the first click, and asks the API for it',
        async (name, expected) => {
            const fetchMock = mockApi()
            renderApp('/agents')
            await loaded()

            await userEvent.click(sortButton(name))

            await expectSearch(expected)
            await waitFor(() =>
                expect(lastAgentUrl(fetchMock)).toBe(
                    `/trail/api/agents?range=24h&sort=${expected.slice(6)}&page=1`,
                ),
            )
        },
    )

    it('flips a sort on the second click and returns to page 1 in the same history entry', async () => {
        const fetchMock = mockApi(sixty)
        renderApp('/agents?page=2')
        await loaded()

        const entries = window.history.length

        await userEvent.click(sortButton(/Est\. cost/))
        await expectSearch('?sort=-cost')
        // One entry for the whole change: sort and page together.
        expect(window.history.length).toBe(entries + 1)
        await waitFor(() =>
            expect(lastAgentUrl(fetchMock)).toBe(
                '/trail/api/agents?range=24h&sort=-cost&page=1',
            ),
        )

        await userEvent.click(sortButton(/Est\. cost/))
        await expectSearch('?sort=cost')
        expect(header(/Est\. cost/)).toHaveAttribute('aria-sort', 'ascending')
    })

    it('pages forward, keeping the sort and the search', async () => {
        const fetchMock = mockApi(sixty)
        renderApp('/agents?sort=-cost&search=support')
        await loaded()

        await userEvent.click(nextButton())

        await expectSearch('?sort=-cost&page=2&search=support')
        await waitFor(() =>
            expect(lastAgentUrl(fetchMock)).toBe(
                '/trail/api/agents?range=24h&sort=-cost&page=2&search=support',
            ),
        )
    })

    it('searches by name, returning to page 1 in one history entry', async () => {
        const fetchMock = mockApi(sixty)
        renderApp('/agents?page=2&sort=-cost')
        await loaded()

        const entries = window.history.length

        await userEvent.type(searchBox(), 'support{Enter}')

        await expectSearch('?sort=-cost&search=support')
        expect(window.history.length).toBe(entries + 1)
        await waitFor(() =>
            expect(lastAgentUrl(fetchMock)).toBe(
                '/trail/api/agents?range=24h&sort=-cost&page=1&search=support',
            ),
        )
    })

    it('changes the range, returns to page 1 and keeps the sort and search, in one history entry', async () => {
        const fetchMock = mockApi(sixty)
        renderApp('/agents?sort=-cost&page=3&search=support')
        await loaded()

        const entries = window.history.length

        await pickRange('Last 7 days')

        await expectSearch('?sort=-cost&search=support&range=7d')
        expect(window.history.length).toBe(entries + 1)
        await waitFor(() =>
            expect(lastAgentUrl(fetchMock)).toBe(
                '/trail/api/agents?range=7d&sort=-cost&page=1&search=support',
            ),
        )
    })

    it('restores the previous sort and page with Back', async () => {
        mockApi(sixty)
        renderApp('/agents')
        await loaded()

        await userEvent.click(sortButton(/Est\. cost/))
        await userEvent.click(nextButton())
        await expectSearch('?sort=-cost&page=2')

        await travel('back')
        await expectSearch('?sort=-cost')
        await waitFor(() =>
            expect(header(/Est\. cost/)).toHaveAttribute(
                'aria-sort',
                'descending',
            ),
        )

        await travel('back')
        await expectSearch('')
        await waitFor(() =>
            expect(header(/Runs/)).toHaveAttribute('aria-sort', 'descending'),
        )
    })
})

describe('a page past the end', () => {
    it('lands on the real last page without adding a history entry', async () => {
        const fetchMock = mockApi((url) =>
            paramsOf(url).page === '99'
                ? json(listOf([], { page: 99, total: 60 }))
                : sixty(url),
        )
        renderApp('/agents?page=99')

        const entries = window.history.length

        await expectSearch('?page=3')
        await screen.findByText('Page 3 of 3')
        expect(window.history.length).toBe(entries)
        expect(lastAgentUrl(fetchMock)).toBe(
            '/trail/api/agents?range=24h&sort=-runs&page=3',
        )
    })
})

describe('while the agents load', () => {
    it('shows a table-shaped skeleton on the first load, with no count, no pagination and no footnote', async () => {
        mockApi(never)
        renderApp('/agents')
        await appReady()

        expect(table()).toHaveAttribute('aria-busy', 'true')
        expect(within(table()).getAllByRole('columnheader')).toHaveLength(7)
        expect(table().querySelectorAll('tbody tr')).toHaveLength(8)
        expect(
            [...table().querySelectorAll('tbody td')].map((c) => c.textContent),
        ).toEqual(Array(8 * 7).fill(''))
        expect(
            screen.queryByRole('navigation', { name: 'Pagination' }),
        ).not.toBeInTheDocument()
        expect(footnote()).not.toBeInTheDocument()
    })

    it('replaces the skeleton with the rows', async () => {
        const first = deferred()
        mockApi(() => first.promise)
        renderApp('/agents')
        await appReady()

        first.resolve(new Response(JSON.stringify(agentFixture)))
        await screen.findByText('Page 1 of 1')

        expect(table()).not.toHaveAttribute('aria-busy')
        expect(dataRows()).toHaveLength(agentFixture.data.length)
    })

    it('keeps the rows, dimmed and busy, while the next page loads, and keeps the page they belong to', async () => {
        const fetchMock = mockApi(sixty)
        renderApp('/agents')
        await loaded()

        const next = deferred()
        answerWith(fetchMock, () => next.promise)

        await userEvent.click(nextButton())

        await waitFor(() => expect(agentUrls(fetchMock)).toHaveLength(2))
        expect(dataRows()).toHaveLength(agentFixture.data.length)
        expect(table()).toHaveAttribute('aria-busy', 'true')
        expect(table().querySelector('tbody')).toHaveClass('opacity-60')
        expect(screen.getByText('Page 1 of 3')).toBeVisible()
        expect(screen.getByText('1–25 of 60 agents')).toBeVisible()

        next.resolve(
            new Response(
                JSON.stringify(
                    listOf(agentFixture.data, { page: 2, total: 60 }),
                ),
            ),
        )

        await screen.findByText('Page 2 of 3')
        expect(table()).not.toHaveAttribute('aria-busy')
    })

    it('keeps the range the rows were counted over in their links until the next range arrives', async () => {
        const fetchMock = mockApi(sixty)
        renderApp('/agents?range=7d')
        await loaded()

        const link = () =>
            screen
                .getByRole('link', { name: 'SupportAssistant' })
                .getAttribute('href') ?? ''

        expect(link()).toContain('&range=7d&')

        answerWith(fetchMock, never)
        await pickRange('Last 24 hours')
        await waitFor(() =>
            expect(table()).toHaveAttribute('aria-busy', 'true'),
        )

        // The URL has moved on to the default range; these rows are still the 7 day ones.
        expect(window.location.search).toBe('')
        expect(link()).toContain('&range=7d&')
    })

    it('does not claim a new range is empty because the previous one was', async () => {
        const fetchMock = mockApi(() => json(emptyAgents))
        renderApp('/agents?range=1h')
        await screen.findByText('No agents ran in this range')

        answerWith(fetchMock, never)
        await pickRange('Last 24 hours')

        await waitFor(() =>
            expect(table()).toHaveAttribute('aria-busy', 'true'),
        )
        expect(
            screen.queryByText('No agents ran in this range'),
        ).not.toBeInTheDocument()
    })
})

describe('when the agents cannot be loaded', () => {
    it('shows the API’s message and status, and no table', async () => {
        mockApi(() => json({ message: 'The database is down.' }, 500))
        renderApp('/agents')

        const alert = await screen.findByRole('alert')

        expect(alert).toHaveTextContent('The agents could not be loaded')
        expect(alert).toHaveTextContent('The database is down.')
        expect(alert).toHaveTextContent('Error 500')
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
        expect(screen.queryByText(/^\d+ agents?$/)).not.toBeInTheDocument()
    })

    it('keeps the error state and its button while a retry runs, then shows the rows and moves focus off the gone button', async () => {
        const fetchMock = mockApi(() => json({ message: 'Down.' }, 500))
        renderApp('/agents')
        await screen.findByRole('alert')

        const retry = deferred()
        answerWith(fetchMock, () => retry.promise)

        const button = screen.getByRole('button', { name: 'Try again' })
        button.focus()
        await userEvent.click(button)

        await waitFor(() => expect(agentUrls(fetchMock)).toHaveLength(2))
        const busy = screen.getByRole('button', { name: 'Trying again…' })

        expect(busy).toBe(button)
        expect(busy).toHaveFocus()
        expect(screen.queryByRole('table')).not.toBeInTheDocument()

        retry.resolve(new Response(JSON.stringify(agentFixture)))

        await screen.findByText('Page 1 of 1')
        expect(dataRows()).toHaveLength(agentFixture.data.length)
        expect(
            screen.getByRole('heading', { level: 1, name: 'Agents' }),
        ).toHaveFocus()
    })

    it('says the server could not be reached on a network failure', async () => {
        mockApi(() => Promise.reject(new TypeError('Failed to fetch')))
        renderApp('/agents')

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The server could not be reached.',
        )
    })

    it('does not leave another page’s rows up when the next page fails', async () => {
        const fetchMock = mockApi(sixty)
        renderApp('/agents')
        await loaded()

        answerWith(fetchMock, () => json({ message: 'No.' }, 500))

        await userEvent.click(nextButton())

        expect(await screen.findByRole('alert')).toHaveTextContent('No.')
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('does not carry the failure to another range', async () => {
        const fetchMock = mockApi(() => json({ message: 'Down.' }, 500))
        renderApp('/agents')
        await screen.findByRole('alert')

        answerWith(fetchMock, never)
        await pickRange('Last 7 days')

        // While the other range loads, it is loading: not failed.
        await waitFor(() =>
            expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
        )
        expect(table()).toHaveAttribute('aria-busy', 'true')
    })
})

describe('when no agent ran in the range', () => {
    it('says so, and that a longer range may show more, with no pagination, footnote or count to clear', async () => {
        mockApi(() => json(emptyAgents))
        renderApp('/agents')

        const heading = await screen.findByRole('heading', {
            name: 'No agents ran in this range',
        })

        expect(
            screen.getByText(
                'Agents are discovered from recorded runs. A longer range may show more.',
            ),
        ).toBeVisible()
        expect(heading.closest('[data-slot="data-table"]')).toBe(
            table().closest('[data-slot="data-table"]'),
        )
        expect(
            screen.queryByRole('navigation', { name: 'Pagination' }),
        ).not.toBeInTheDocument()
        expect(footnote()).not.toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: 'Show all agents' }),
        ).not.toBeInTheDocument()
        expect(
            screen.queryByText('No agents match this search'),
        ).not.toBeInTheDocument()
    })
})

describe('when the search hides every agent', () => {
    it('says none match, and "Show all agents" shows them again and puts focus in the search box', async () => {
        const fetchMock = mockApi((url) =>
            url.includes('search=zzz') ? json(emptyAgents) : sixty(url),
        )
        renderApp('/agents?search=zzz&sort=-cost')

        await screen.findByRole('heading', {
            name: 'No agents match this search',
        })

        expect(
            screen.queryByText('No agents ran in this range'),
        ).not.toBeInTheDocument()
        expect(searchBox()).toHaveValue('zzz')

        await userEvent.click(
            screen.getByRole('button', { name: 'Show all agents' }),
        )

        await expectSearch('?sort=-cost')
        await waitFor(() =>
            expect(dataRows()).toHaveLength(agentFixture.data.length),
        )
        expect(paramsOf(lastAgentUrl(fetchMock))).not.toHaveProperty('search')
        expect(searchBox()).toHaveFocus()
    })
})

describe('when the API says it read only some of the agents', () => {
    it('says the list may be incomplete, and that own or delegated runs may be missing', async () => {
        mockApi(() => json(listOf(agentFixture.data, { truncated: true })))
        renderApp('/agents')
        await loaded()

        const notice = document.querySelector('[data-slot="notice"]')

        expect(notice).toHaveTextContent('Only the busiest agents were read')
        expect(notice).toHaveTextContent('1,000 agents with the most runs')
        expect(notice).toHaveTextContent('this list may be incomplete')
        expect(notice).toHaveTextContent(
            'own runs or its delegated runs may be missing',
        )
    })

    it('says nothing when everything was read', async () => {
        mockApi(() => json(listOf(agentFixture.data, { truncated: false })))
        renderApp('/agents')
        await loaded()

        expect(
            screen.queryByText('Only the busiest agents were read'),
        ).not.toBeInTheDocument()
        expect(document.querySelector('[data-slot="notice"]')).toBeNull()
    })

    it('does not say it about a view that is not the one asked for', async () => {
        const fetchMock = mockApi(() =>
            json(listOf(agentFixture.data, { truncated: true, total: 60 })),
        )
        renderApp('/agents')
        await loaded()
        expect(document.querySelector('[data-slot="notice"]')).not.toBeNull()

        answerWith(fetchMock, never)
        await userEvent.click(nextButton())

        await waitFor(() =>
            expect(table()).toHaveAttribute('aria-busy', 'true'),
        )
        expect(document.querySelector('[data-slot="notice"]')).toBeNull()
    })
})

describe('the rows lead to the agent', () => {
    it('opens the agent’s page with the range, and the breadcrumb leads back to this view', async () => {
        mockApi()
        renderApp('/agents?range=7d&sort=-cost&search=a')
        await loaded()

        await userEvent.click(
            screen.getByRole('link', { name: 'SupportAssistant' }),
        )

        await screen.findByRole('heading', { level: 1, name: 'Agent' })
        expect(window.location.pathname).toBe('/trail/agents/agent')
        expect(new URLSearchParams(window.location.search).get('name')).toBe(
            'SupportAssistant',
        )
        expect(new URLSearchParams(window.location.search).get('range')).toBe(
            '7d',
        )

        const crumb = within(screen.getByRole('banner')).getByRole('link', {
            name: 'Agents',
        })

        expect(crumb).toHaveAttribute(
            'href',
            '/trail/agents?range=7d&sort=-cost&search=a',
        )
    })

    it('is told the view of this list, so it can lead back to it', async () => {
        renderApp('/agents?range=7d&sort=-cost')
        await loaded()

        const href =
            screen
                .getByRole('link', { name: 'SupportAssistant' })
                .getAttribute('href') ?? ''

        expect(new URLSearchParams(href.split('?')[1]).get('from')).toBe(
            '/agents?range=7d&sort=-cost',
        )
    })
})

describe('the sort control for the widths without every header', () => {
    const control = () => screen.getByRole('combobox', { name: 'Sort by' })
    const pick = async (name: string) => {
        await userEvent.click(control())
        await userEvent.click(screen.getByRole('option', { name }))
    }

    it('is there only below the widest layout, and only as the headers’ other way', async () => {
        renderApp('/agents')
        await loaded()

        // A test DOM has no layout, so these are the classes that show it below the roomy
        // breakpoint and hide it from there, where every sortable column has its header.
        const wrapper = document.querySelector('[data-slot="sort-select"]')

        expect(wrapper).toContainElement(control())
        expect(wrapper).toHaveClass('flex', 'roomy:hidden')
        expect(wrapper?.className).not.toMatch(/(^|\s)hidden(\s|$)/)
        expect(
            [...screen.getAllByRole('columnheader')]
                .filter((head) => head.hasAttribute('aria-sort'))
                .map((head) => head.className.includes('hidden')),
        ).toEqual([false, false, false, true, true, true])
    })

    it('lists all six sorts in both directions', async () => {
        renderApp('/agents')
        await loaded()
        await userEvent.click(control())

        expect(
            screen.getAllByRole('option').map((option) => option.textContent),
        ).toEqual([
            'Runs, most first',
            'Agent, A to Z',
            'Agent, Z to A',
            'Runs, fewest first',
            'Error rate, lowest first',
            'Error rate, highest first',
            'Avg duration, fastest first',
            'Avg duration, slowest first',
            'Est. cost, lowest first',
            'Est. cost, highest first',
            'Last activity, oldest first',
            'Last activity, newest first',
        ])
    })

    it.each([
        ['Agent, A to Z', '?sort=name', 'name'],
        ['Agent, Z to A', '?sort=-name', '-name'],
        ['Runs, fewest first', '?sort=runs', 'runs'],
        ['Error rate, lowest first', '?sort=error_rate', 'error_rate'],
        ['Error rate, highest first', '?sort=-error_rate', '-error_rate'],
        ['Avg duration, fastest first', '?sort=duration', 'duration'],
        ['Avg duration, slowest first', '?sort=-duration', '-duration'],
        ['Est. cost, lowest first', '?sort=cost', 'cost'],
        ['Est. cost, highest first', '?sort=-cost', '-cost'],
        ['Last activity, oldest first', '?sort=last_activity', 'last_activity'],
        [
            'Last activity, newest first',
            '?sort=-last_activity',
            '-last_activity',
        ],
    ])(
        'sets %s in the URL and the request, back on page 1 in one history entry',
        async (name, search, sort) => {
            const fetchMock = mockApi(sixty)
            renderApp('/agents?page=2')
            await loaded()

            const entries = window.history.length

            await pick(name)

            await expectSearch(search)
            expect(window.history.length).toBe(entries + 1)
            await waitFor(() =>
                expect(lastAgentUrl(fetchMock)).toBe(
                    `/trail/api/agents?range=24h&sort=${sort}&page=1`,
                ),
            )
        },
    )

    it('sets the default sort by leaving it out of the URL, and returns to page 1', async () => {
        const fetchMock = mockApi(sixty)
        renderApp('/agents?sort=name&page=2')
        await loaded()

        const entries = window.history.length

        await pick('Runs, most first')

        await expectSearch('')
        expect(window.history.length).toBe(entries + 1)
        await waitFor(() =>
            expect(lastAgentUrl(fetchMock)).toBe(
                '/trail/api/agents?range=24h&sort=-runs&page=1',
            ),
        )
    })

    it('keeps the search and the range when it sorts', async () => {
        mockApi(sixty)
        renderApp('/agents?range=7d&search=support&page=3')
        await loaded()

        await pick('Est. cost, highest first')

        await expectSearch('?range=7d&sort=-cost&search=support')
    })

    it.each([
        ['', 'Runs, most first'],
        ['?sort=-cost', 'Est. cost, highest first'],
        ['?sort=last_activity', 'Last activity, oldest first'],
        ['?sort=-name&page=2', 'Agent, Z to A'],
    ])('shows the sort the URL has: %j reads "%s"', async (query, label) => {
        mockApi(sixty)
        renderApp(`/agents${query}`)
        await loaded()

        expect(control()).toHaveTextContent(label)
    })

    it('shows the sort a header chose, and a header shows the one it chose', async () => {
        mockApi(sixty)
        renderApp('/agents')
        await loaded()

        await userEvent.click(sortButton(/Error rate/))
        await expectSearch('?sort=-error_rate')

        expect(control()).toHaveTextContent('Error rate, highest first')

        await pick('Agent, A to Z')
        await expectSearch('?sort=name')

        expect(header(/^Agent/)).toHaveAttribute('aria-sort', 'ascending')
        expect(header(/Error rate/)).toHaveAttribute('aria-sort', 'none')
    })

    it('follows Back to the sort before', async () => {
        mockApi(sixty)
        renderApp('/agents')
        await loaded()

        await pick('Est. cost, highest first')
        await expectSearch('?sort=-cost')
        await travel('back')
        await expectSearch('')

        await waitFor(() =>
            expect(control()).toHaveTextContent('Runs, most first'),
        )
    })
})

describe('the way back that the rows carry', () => {
    const fromOf = (name: string) =>
        new URLSearchParams(
            (
                screen.getByRole('link', { name }).getAttribute('href') ?? ''
            ).split('?')[1],
        ).get('from')
    const rangeOfLink = (name: string) =>
        new URLSearchParams(
            (
                screen.getByRole('link', { name }).getAttribute('href') ?? ''
            ).split('?')[1],
        ).get('range')

    it('stays the view that made the rows while a new range loads, then becomes the new one', async () => {
        const fetchMock = mockApi(sixty)
        renderApp('/agents?range=7d&sort=-cost')
        await loaded()

        expect(rangeOfLink('SupportAssistant')).toBe('7d')
        expect(fromOf('SupportAssistant')).toBe('/agents?range=7d&sort=-cost')

        const next = deferred()

        answerWith(fetchMock, () => next.promise)
        await pickRange('Last 24 hours')
        await waitFor(() =>
            expect(table()).toHaveAttribute('aria-busy', 'true'),
        )

        // The address is the new view; the dimmed rows are the old one, and so are their links.
        expect(window.location.search).toBe('?sort=-cost')
        expect(rangeOfLink('SupportAssistant')).toBe('7d')
        expect(fromOf('SupportAssistant')).toBe('/agents?range=7d&sort=-cost')

        next.resolve(
            new Response(
                JSON.stringify(
                    listOf(agentFixture.data, { total: 60, preset: '24h' }),
                ),
            ),
        )

        await waitFor(() => expect(table()).not.toHaveAttribute('aria-busy'))
        expect(rangeOfLink('SupportAssistant')).toBeNull()
        expect(fromOf('SupportAssistant')).toBe('/agents?sort=-cost')
    })

    it('stays the page that made the rows while the next page loads', async () => {
        const fetchMock = mockApi(sixty)
        renderApp('/agents')
        await loaded()

        expect(fromOf('SupportAssistant')).toBe('/agents')

        const next = deferred()

        answerWith(fetchMock, () => next.promise)
        await userEvent.click(nextButton())
        await waitFor(() =>
            expect(table()).toHaveAttribute('aria-busy', 'true'),
        )

        expect(window.location.search).toBe('?page=2')
        expect(fromOf('SupportAssistant')).toBe('/agents')

        next.resolve(
            new Response(
                JSON.stringify(
                    listOf(agentFixture.data, { page: 2, total: 60 }),
                ),
            ),
        )

        await screen.findByText('Page 2 of 3')
        expect(fromOf('SupportAssistant')).toBe('/agents?page=2')
    })
})

describe('the refresh control', () => {
    it('asks for the list again', async () => {
        const fetchMock = mockApi()
        renderApp('/agents')
        await loaded()
        const before = agentUrls(fetchMock).length

        await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

        await waitFor(() =>
            expect(agentUrls(fetchMock)).toHaveLength(before + 1),
        )
    })
})
