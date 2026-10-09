import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetAgentRefreshFailures } from '@/features/agents/use-agent'
import { forgetBreakdownRefreshFailures } from '@/features/agents/use-agent-breakdown'
import { forgetRecentTracesRefreshFailures } from '@/features/traces'
import {
    deferred,
    json,
    mockApi,
    nothingInRange,
    paramsOf,
    queryOf,
    recentFor,
    showFor,
    strip,
    subAgentOnly,
    traceUrls,
} from '@/test/agent-page-api'
import { renderApp } from '@/test/render-app'
import { until } from '@/test/wait'

beforeEach(() => {
    forgetAgentRefreshFailures()
    forgetBreakdownRefreshFailures()
    forgetRecentTracesRefreshFailures()
})

afterEach(() => {
    vi.useRealTimers()
})

const section = () =>
    screen
        .getByRole('heading', { name: 'Recent traces' })
        .closest<HTMLElement>('[data-slot="recent-traces"]') as HTMLElement

const rows = () => within(section()).getAllByRole('row').slice(1)

async function open(search = '', name = 'Support/Bot') {
    renderApp(`/agents/agent?name=${encodeURIComponent(name)}${search}`)
    await waitFor(() => expect(strip()).not.toBeNull())
    await screen.findByRole('heading', { name: 'Recent traces' })
}

describe('the recent traces of an agent', () => {
    it('are its latest runs, newest first, as many as the limit, asked for by the name its runs spell', async () => {
        const fetchMock = mockApi()

        await open('&range=7d')
        await waitFor(() => expect(rows()).toHaveLength(8))

        expect(paramsOf(traceUrls(fetchMock).at(-1))).toEqual({
            range: '7d',
            agent: 'Support/Bot',
            sort: '-started_at',
            per_page: '8',
        })
        // A name is not a status: nothing but those four is asked for.
        expect(queryOf(traceUrls(fetchMock).at(-1) ?? '').has('page')).toBe(
            false,
        )
    })

    it('draw the list’s own cells, in its order, with no selection, bookmark or sorting', async () => {
        mockApi()

        await open()
        await waitFor(() => expect(rows()).toHaveLength(8))

        const table = within(section()).getByRole('table')

        expect(
            within(table)
                .getAllByRole('columnheader')
                .map((header) => header.textContent),
        ).toEqual([
            'Run',
            'Outcome',
            'Root model',
            'Duration',
            'Tokens',
            'Est. cost',
            'Started',
        ])
        expect(within(section()).queryAllByRole('checkbox')).toEqual([])
        expect(within(section()).queryAllByRole('button')).toEqual([])
        expect(
            within(section()).queryByRole('button', { name: /Bookmark/ }),
        ).toBeNull()
        expect(within(section()).queryByRole('tablist')).toBeNull()
        expect(within(section()).queryByRole('searchbox')).toBeNull()
        expect(
            within(section()).queryByRole('navigation', { name: 'Pagination' }),
        ).toBeNull()
        expect(
            within(table)
                .getAllByRole('columnheader')
                .filter((header) => header.hasAttribute('aria-sort')),
        ).toEqual([])

        // The same cells as the list: the run's name, its outcome, its duration and cost.
        const first = rows()[0]

        expect(first).toHaveTextContent('Support/Bot')
        expect(first).toHaveTextContent('Running')
    })

    it('open a run with this page as its way back, with its range and its chart mode', async () => {
        mockApi()

        await open('&range=7d&chart=cost')
        await waitFor(() => expect(rows()).toHaveLength(8))

        const links = within(section())
            .getAllByRole('link')
            .filter((link) =>
                link.getAttribute('href')?.startsWith('/trail/traces/'),
            )

        expect(links).toHaveLength(8)

        for (const [index, link] of links.entries()) {
            const href = new URL(link.getAttribute('href') ?? '', 'http://x')

            expect(href.pathname).toBe(`/trail/traces/run-${index}`)
            expect(href.searchParams.get('from')).toBe(
                `/agents/agent?${new URLSearchParams({ name: 'Support/Bot', range: '7d', chart: 'cost' })}`,
            )
        }
    })

    it('say how many there are in all, as a link to the list of that agent’s runs over the range', async () => {
        mockApi()

        await open('&range=7d')

        expect(
            await screen.findByRole('link', { name: /^View all 37/ }),
        ).toHaveAttribute('href', '/trail/traces?range=7d&agent=Support%2FBot')
    })

    it('list all of them when there are fewer than the limit', async () => {
        mockApi({ traces: (url) => json(recentFor(url, 3)) })

        await open()

        await screen.findByRole('link', { name: /^View all 3/ })
        expect(rows()).toHaveLength(3)
    })

    it('say that there are none, and say no total, when the agent has none in the range', async () => {
        mockApi({
            traces: (url) => json({ ...recentFor(url, 0), data: [] }),
        })

        await open()

        expect(
            await within(section()).findByText('No runs found'),
        ).toBeVisible()
        expect(
            within(section()).queryByRole('link', { name: /View all/ }),
        ).toBeNull()
    })

    it('are not there for an agent with no runs of its own, nor asked for', async () => {
        const fetchMock = mockApi({
            show: (url) => json(showFor(url, subAgentOnly)),
        })

        renderApp('/agents/agent?name=Summarizer')
        await screen.findByText('Delegated runs')
        await screen.findAllByText('claude-haiku-4-5')

        expect(
            screen.queryByRole('heading', { name: 'Recent traces' }),
        ).toBeNull()
        expect(traceUrls(fetchMock)).toEqual([])
    })

    it('are not there for an agent that did nothing in the range', async () => {
        const fetchMock = mockApi({
            show: (url) => json(showFor(url, nothingInRange)),
        })

        renderApp('/agents/agent?name=Quiet')
        await screen.findByText('Nothing ran in this range.')

        expect(
            screen.queryByRole('heading', { name: 'Recent traces' }),
        ).toBeNull()
        expect(traceUrls(fetchMock)).toEqual([])
    })
})

describe('the states of the recent traces', () => {
    it('are loading, with the rest of the page not held up by them', async () => {
        const pending = deferred()
        const fetchMock = mockApi({ traces: () => pending.promise })

        await open()
        await until(() => expect(traceUrls(fetchMock)).toHaveLength(1))

        expect(
            section().querySelectorAll('[data-slot="skeleton"]').length,
        ).toBeGreaterThan(0)
        expect(
            within(section()).queryByRole('link', { name: /View all/ }),
        ).toBeNull()
        expect(
            screen.getByRole('heading', { name: 'Needs attention' }),
        ).toBeVisible()

        pending.resolve(await json(recentFor(traceUrls(fetchMock)[0] ?? '')))
        await waitFor(() => expect(rows()).toHaveLength(8))
    })

    it('are failed with a way to try again, and the failure does not blank the page', async () => {
        let fail = true
        mockApi({
            traces: (url) =>
                fail ? json({ message: 'Down.' }, 500) : json(recentFor(url)),
        })

        await open()

        expect(await within(section()).findByRole('alert')).toHaveTextContent(
            'The recent traces could not be loaded',
        )
        expect(
            screen.getByRole('heading', { name: 'Needs attention' }),
        ).toBeVisible()
        expect(screen.getAllByRole('alert')).toHaveLength(1)

        fail = false
        await userEvent.click(
            within(section()).getByRole('button', { name: 'Try again' }),
        )
        await waitFor(() => expect(rows()).toHaveLength(8))
        expect(screen.queryByRole('alert')).toBeNull()
    })

    it('hand focus to the page heading when the retry brings the runs, not to nothing', async () => {
        let fail = true
        mockApi({
            traces: (url) =>
                fail ? json({ message: 'Down.' }, 500) : json(recentFor(url)),
        })

        await open()
        const retry = await within(section()).findByRole('button', {
            name: 'Try again',
        })

        retry.focus()
        fail = false
        await userEvent.click(retry)
        await waitFor(() => expect(rows()).toHaveLength(8))

        await waitFor(() =>
            expect(
                screen.getByRole('heading', { level: 1, name: 'Support/Bot' }),
            ).toHaveFocus(),
        )
    })

    it('keep the previous range’s rows dimmed, with no total that is not the answer, until the next arrive', async () => {
        const next = deferred()
        mockApi({
            traces: (url) =>
                paramsOf(url).range === '7d'
                    ? next.promise
                    : json(recentFor(url, 37)),
        })

        await open()
        await screen.findByRole('link', { name: /^View all 37/ })
        expect(section().querySelector('[aria-busy="true"]')).toBeNull()

        await userEvent.click(screen.getByRole('combobox'))
        await userEvent.click(
            await screen.findByRole('option', { name: 'Last 7 days' }),
        )

        // The 24 hours' rows stay, dimmed, and the 24 hours' total is not said as the week's.
        await waitFor(() =>
            expect(
                section().querySelector('[aria-busy="true"]'),
            ).not.toBeNull(),
        )
        expect(rows()).toHaveLength(8)
        expect(
            within(section()).queryByRole('link', { name: /View all/ }),
        ).toBeNull()

        next.resolve(await json(recentFor('?range=7d&agent=Support/Bot', 120)))

        expect(
            await screen.findByRole('link', { name: /^View all 120/ }),
        ).toHaveAttribute('href', '/trail/traces?range=7d&agent=Support%2FBot')
        expect(section().querySelector('[aria-busy="true"]')).toBeNull()
    })

    it('do not read "no runs" from the previous range’s empty answer', async () => {
        const next = deferred()
        mockApi({
            traces: (url) =>
                paramsOf(url).range === '7d'
                    ? next.promise
                    : json({ ...recentFor(url, 0), data: [] }),
        })

        await open()
        await within(section()).findByText('No runs found')

        await userEvent.click(screen.getByRole('combobox'))
        await userEvent.click(
            await screen.findByRole('option', { name: 'Last 7 days' }),
        )
        await waitFor(() =>
            expect(within(section()).queryByText('No runs found')).toBeNull(),
        )

        next.resolve(await json(recentFor('?range=7d&agent=Support/Bot', 5)))
        await waitFor(() => expect(rows()).toHaveLength(5))
    })

    it('shows none of the previous agent’s runs while the next agent’s are on the way', async () => {
        const next = deferred()
        mockApi({
            traces: (url) =>
                paramsOf(url).agent === 'Beta'
                    ? next.promise
                    : json(recentFor(url)),
        })

        await open('', 'Alpha')
        await waitFor(() => expect(rows()).toHaveLength(8))
        expect(rows()[0]).toHaveTextContent('Alpha')

        const { act } = await import('@testing-library/react')

        await act(async () => {
            window.history.pushState({}, '', '/trail/agents/agent?name=Beta')
            window.dispatchEvent(new PopStateEvent('popstate'))
            await Promise.resolve()
        })
        await screen.findByRole('heading', { level: 1, name: 'Beta' })
        await screen.findByRole('heading', { name: 'Recent traces' })

        expect(within(section()).queryByText('Alpha')).toBeNull()
        expect(section().querySelector('[aria-busy="true"]')).not.toBeNull()
    })
})
