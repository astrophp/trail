import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetAgentRefreshFailures } from '@/features/agents/use-agent'
import { forgetBreakdownRefreshFailures } from '@/features/agents/use-agent-breakdown'
import { forgetRecentTracesRefreshFailures } from '@/features/traces'
import { maxFailedRefreshes, refreshEvery } from '@/lib/refresh-policy'
import {
    breakdownUrls,
    deferred,
    json,
    mockApi,
    nothingInRange,
    paramsOf,
    showFixture,
    showFor,
    showUrls,
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

const route = (name: string, search = '') =>
    `/agents/agent?name=${encodeURIComponent(name)}${search}`

const figures = () => screen.findByText('Estimated cost')
const valueOf = (label: string) =>
    [...(strip()?.querySelectorAll('[data-slot="metric"]') ?? [])]
        .find((element) => element.querySelector('dt')?.textContent === label)
        ?.querySelector('dd')?.textContent

/** Moves to another address the way a link does, and tells the router. */
async function goTo(path: string) {
    await act(async () => {
        window.history.pushState({}, '', `/trail${path}`)
        window.dispatchEvent(new PopStateEvent('popstate'))
        await Promise.resolve()
    })
}

describe('while the agent loads', () => {
    it('draws the page’s shape and the name as typed, and asks for the models and tools only once it is known', async () => {
        const pending = deferred()
        const fetchMock = mockApi({ show: () => pending.promise })

        renderApp(route('Support/1'))

        expect(
            await screen.findByRole('heading', { level: 1, name: 'Support/1' }),
        ).toBeVisible()
        expect(
            document.querySelector('[data-slot="agent-skeleton"]'),
        ).not.toBeNull()
        expect(strip()).toBeNull()
        expect(screen.queryByRole('alert')).toBeNull()
        await until(() => expect(showUrls(fetchMock)).toHaveLength(1))
        expect(breakdownUrls(fetchMock)).toEqual([])
        expect(traceUrls(fetchMock)).toEqual([])
        expect(document.title).toBe('Support/1 · Trail')

        pending.resolve(await json(showFor(showUrls(fetchMock)[0] ?? '')))
        await figures()

        expect(
            document.querySelector('[data-slot="agent-skeleton"]'),
        ).toBeNull()
        await until(() => expect(breakdownUrls(fetchMock)).toHaveLength(1))
    })
})

describe('an agent that was never recorded', () => {
    it('says so, naming it as typed, with the way to the list of agents, and asks for nothing else', async () => {
        const fetchMock = mockApi({
            show: () => json({ message: 'Not found.' }, 404),
        })

        renderApp(route(' Ghost/Agent '))

        expect(
            await screen.findByRole('heading', {
                level: 2,
                name: 'This agent was not found',
            }),
        ).toBeVisible()
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
            ' Ghost/Agent ',
        )
        expect(screen.getByText(/^“ Ghost\/Agent ”$/)).toBeVisible()
        expect(
            screen.getByRole('link', { name: 'Back to Agents' }),
        ).toHaveAttribute('href', '/trail/agents')
        // Not a failure: nothing to retry, and not said as one.
        expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull()
        expect(screen.queryByText('The agent could not be loaded')).toBeNull()
        expect(strip()).toBeNull()
        await until(() => expect(showUrls(fetchMock)).toHaveLength(1))
        expect(breakdownUrls(fetchMock)).toEqual([])
        expect(traceUrls(fetchMock)).toEqual([])
    })

    it('leads back to the list of agents it was opened from, with its view', async () => {
        mockApi({ show: () => json({ message: 'Not found.' }, 404) })

        renderApp(
            `${route('Ghost')}&${new URLSearchParams({ from: '/agents?range=7d&sort=-cost' })}`,
        )
        await screen.findByRole('heading', { name: 'This agent was not found' })

        expect(
            screen.getByRole('link', { name: 'Back to Agents' }),
        ).toHaveAttribute('href', '/trail/agents?range=7d&sort=-cost')
    })

    it('is told apart from a failed request, which says so and can be tried again', async () => {
        mockApi({ show: () => json({ message: 'Down.' }, 500) })

        renderApp(route('Ghost'))

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The agent could not be loaded',
        )
        expect(screen.queryByText('This agent was not found')).toBeNull()
    })
})

describe('an address that names no agent', () => {
    it('is the not-found state, and asks for nothing', async () => {
        const fetchMock = mockApi()

        renderApp('/agents/agent')

        expect(
            await screen.findByRole('heading', { name: 'No agent was named' }),
        ).toBeVisible()
        expect(
            screen.getByRole('link', { name: 'Back to Agents' }),
        ).toBeVisible()
        expect(showUrls(fetchMock)).toEqual([])
        expect(breakdownUrls(fetchMock)).toEqual([])
    })

    it('is the same for a name that is empty', async () => {
        const fetchMock = mockApi()

        renderApp('/agents/agent?name=')

        await screen.findByRole('heading', { name: 'No agent was named' })
        expect(showUrls(fetchMock)).toEqual([])
    })
})

describe('a failed request', () => {
    it('says so with the way to try again, and recovers', async () => {
        let fail = true
        const fetchMock = mockApi({
            show: (url) =>
                fail ? json({ message: 'Down.' }, 500) : json(showFor(url)),
        })

        renderApp(route('SupportAssistant'))

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The agent could not be loaded',
        )
        expect(
            screen.getByRole('heading', { level: 1, name: 'SupportAssistant' }),
        ).toBeVisible()
        expect(strip()).toBeNull()

        fail = false
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
        await figures()

        expect(screen.queryByRole('alert')).toBeNull()
        expect(showUrls(fetchMock)).toHaveLength(2)
    })

    it('says that the server could not be reached for a request that got no answer', async () => {
        mockApi({ show: () => Promise.reject(new TypeError('offline')) })

        renderApp(route('SupportAssistant'))

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The server could not be reached',
        )
    })
})

describe('an agent that did nothing in the range', () => {
    it('keeps the header and says so with its name and class, with no strip, chart or panels of zeros', async () => {
        const fetchMock = mockApi({
            show: (url) => json(showFor(url, nothingInRange)),
        })

        renderApp(route('SupportAssistant'))

        const notice = (
            await screen.findByText('Nothing ran in this range.')
        ).closest('[data-slot="notice"]')

        expect(notice).toHaveTextContent('Nothing ran in this range.')
        expect(notice).toHaveTextContent('SupportAssistant')
        expect(notice).toHaveTextContent('App\\Ai\\Agents\\SupportAssistant')
        expect(notice).toHaveTextContent('Try a longer range.')
        expect(
            screen.getByRole('heading', { level: 1, name: 'SupportAssistant' }),
        ).toBeVisible()
        expect(strip()).toBeNull()
        expect(
            screen.queryByRole('heading', { name: 'Trace activity' }),
        ).toBeNull()
        expect(screen.queryByRole('heading', { name: 'Models' })).toBeNull()
        expect(
            screen.queryByRole('heading', { name: 'Recent traces' }),
        ).toBeNull()
        expect(
            screen.queryByRole('link', { name: 'View all traces' }),
        ).toBeNull()
        expect(
            screen.queryByText(/Runs (on its own|only as a sub-agent)/),
        ).toBeNull()
        await until(() => expect(showUrls(fetchMock)).toHaveLength(1))
        expect(breakdownUrls(fetchMock)).toEqual([])
        expect(traceUrls(fetchMock)).toEqual([])
    })

    it('does not suggest a longer range when it already is the longest', async () => {
        mockApi({ show: (url) => json(showFor(url, nothingInRange)) })

        renderApp(route('SupportAssistant', '&range=7d'))

        const notice = await screen.findByText(/Nothing ran in this range/)

        expect(notice.closest('[data-slot="notice"]')).not.toHaveTextContent(
            'Try a longer range',
        )
    })
})

describe('an agent that only ran as a sub-agent', () => {
    it('has no figures of runs it does not have, says where its runs are, and lists what is known', async () => {
        const fetchMock = mockApi({
            show: (url) => json(showFor(url, subAgentOnly)),
        })

        renderApp(route('Summarizer'))

        const heading = await screen.findByRole('heading', {
            level: 2,
            name: 'As a sub-agent',
        })

        expect(screen.getByText(/Runs only as a sub-agent/)).toBeVisible()
        expect(
            screen.getByText(
                /recorded inside the runs of the agents that delegated to it/,
            ),
        ).toBeVisible()

        // A table of what is known: the counts, and when it was last delegated to.
        const rows = within(
            heading.closest('[data-slot="panel"]') as HTMLElement,
        )
        const table = rows.getByText('Delegated runs').closest('dl')

        expect(
            [...(table?.querySelectorAll('[data-slot="key-value"]') ?? [])].map(
                (row) => [
                    row.querySelector('dt')?.textContent,
                    row.querySelector('dd')?.textContent,
                ],
            ),
        ).toEqual([
            ['Delegated runs', '2'],
            ['Failed', '1'],
            ['Incomplete', '0'],
            ['Last delegated', expect.stringMatching(/ago|2026|Jan/)],
        ])

        // None of what an agent with runs of its own has.
        expect(strip()).toBeNull()
        expect(
            screen.queryByRole('heading', { name: 'Trace activity' }),
        ).toBeNull()
        expect(
            screen.queryByRole('heading', { name: 'Needs attention' }),
        ).toBeNull()
        expect(
            screen.queryByRole('heading', { name: 'Recent traces' }),
        ).toBeNull()
        expect(
            screen.queryByRole('link', { name: 'View all traces' }),
        ).toBeNull()
        expect(screen.queryByText('Error rate')).toBeNull()
        expect(screen.queryByText('Not captured')).toBeNull()

        // The models and tools of the runs it was delegated to are its main content.
        await screen.findByRole('heading', { name: 'Models' })
        await screen.findByText('claude-haiku-4-5')

        expect(traceUrls(fetchMock)).toEqual([])
        expect(breakdownUrls(fetchMock)).toHaveLength(1)
    })

    it('leaves out the time of the last delegation when it could not be read', async () => {
        mockApi({
            show: (url) =>
                json(
                    showFor(url, {
                        ...subAgentOnly,
                        agent: {
                            ...subAgentOnly.agent,
                            delegated: {
                                all: 2,
                                failed: 0,
                                incomplete: 0,
                                last_activity_at: null,
                            },
                        },
                    }),
                ),
        })

        renderApp(route('Summarizer'))
        await screen.findByText('Delegated runs')

        expect(screen.queryByText('Last delegated')).toBeNull()
        expect(screen.queryByText('Not captured')).toBeNull()
    })
})

describe('the page’s structure', () => {
    it('has the agent’s name as its one h1 and h2 panels after it, none skipped, in the order they are laid out', async () => {
        mockApi()

        renderApp(route('SupportAssistant'))
        await figures()
        await screen.findByRole('heading', { name: 'Recent traces' })
        await screen.findAllByText('claude-haiku-4-5')

        const headings = screen
            .getAllByRole('heading')
            .filter((heading) => heading.closest('main'))
            .map((heading) => [
                Number(
                    heading.getAttribute('aria-level') ??
                        heading.tagName.slice(1),
                ),
                heading.textContent,
            ])

        expect(headings).toEqual([
            [1, 'SupportAssistant'],
            [2, 'Trace activity'],
            [2, 'Needs attention'],
            [2, 'Models'],
            [3, 'Inside its runs as a sub-agent'],
            [2, 'Tools'],
            [3, 'Inside its runs as a sub-agent'],
            [2, 'Recent traces'],
        ])
    })

    it('reads in the order it is drawn: the figures, then the chart, what needs attention, the models, the tools, the runs', async () => {
        mockApi()

        renderApp(route('SupportAssistant'))
        await figures()
        await screen.findByRole('heading', { name: 'Recent traces' })

        const before = (first: Element, second: Element) =>
            Boolean(
                first.compareDocumentPosition(second) &
                Node.DOCUMENT_POSITION_FOLLOWING,
            )
        const at = (title: string) =>
            screen.getByRole('heading', { name: title })

        expect(
            before(
                screen.getByRole('heading', { level: 1 }),
                strip() as Element,
            ),
        ).toBe(true)
        expect(before(strip() as Element, at('Trace activity'))).toBe(true)
        expect(before(at('Trace activity'), at('Needs attention'))).toBe(true)
        expect(before(at('Needs attention'), at('Models'))).toBe(true)
        expect(before(at('Models'), at('Tools'))).toBe(true)
        expect(before(at('Tools'), at('Recent traces'))).toBe(true)
    })
})

describe('changing the range', () => {
    it('keeps the previous range’s figures dimmed, with their own words and links, until the next arrive', async () => {
        const next = deferred()
        const fetchMock = mockApi({
            show: (url) =>
                paramsOf(url).range === '7d'
                    ? next.promise
                    : json(showFor(url)),
        })

        renderApp(route('SupportAssistant'))
        await figures()
        expect(strip()?.closest('[aria-busy]')).toBeNull()

        await userEvent.click(screen.getByRole('combobox'))
        await userEvent.click(
            await screen.findByRole('option', { name: 'Last 7 days' }),
        )

        await waitFor(() =>
            expect(strip()?.closest('[aria-busy="true"]')).not.toBeNull(),
        )

        const dimmed = strip()?.closest('[aria-busy="true"]') as HTMLElement

        expect(dimmed).toHaveClass('opacity-60')
        expect(valueOf('Traces')).toBe('23')
        expect(
            within(metricOf('Traces')).getByText('vs previous 24 hours'),
        ).toBeVisible()
        // Its links are the 24 hours', and so is the way to all its traces.
        expect(
            within(dimmed)
                .getAllByRole('link')
                .map((link) => link.getAttribute('href')),
        ).toEqual([
            '/trail/traces?agent=SupportAssistant',
            '/trail/traces?status=failed&agent=SupportAssistant',
            '/trail/traces?agent=SupportAssistant&slow=1',
            '/trail/traces?sort=-cost&agent=SupportAssistant',
        ])
        expect(
            screen.getByRole('link', { name: 'View all traces' }),
        ).toHaveAttribute('href', '/trail/traces?agent=SupportAssistant')
        // The announcement sits outside the dimmed part.
        expect(
            screen
                .getAllByRole('status')
                .some((status) => status.textContent === 'Loading the figures'),
        ).toBe(true)

        next.resolve(
            await json({
                ...showFor(showUrls(fetchMock).at(-1) ?? ''),
                range: { ...showFixture.range, preset: '7d' },
            }),
        )
        await waitFor(() =>
            expect(strip()?.closest('[aria-busy="true"]')).toBeNull(),
        )

        expect(
            within(metricOf('Traces')).getByText('vs previous 7 days'),
        ).toBeVisible()
        expect(
            screen.getByRole('link', { name: 'View all traces' }),
        ).toHaveAttribute(
            'href',
            '/trail/traces?range=7d&agent=SupportAssistant',
        )
    })

    it('draws an empty answer for the next range only once it has arrived', async () => {
        const next = deferred()
        const fetchMock = mockApi({
            show: (url) =>
                paramsOf(url).range === '1h'
                    ? next.promise
                    : json(showFor(url, nothingInRange)),
        })

        renderApp(route('SupportAssistant'))
        await screen.findByText(/Nothing ran in this range/)

        await userEvent.click(screen.getByRole('combobox'))
        await userEvent.click(
            await screen.findByRole('option', { name: 'Last hour' }),
        )
        await until(() => expect(showUrls(fetchMock)).toHaveLength(2))

        // The "nothing" on screen is the 24 hours': it says nothing about this hour.
        expect(screen.queryByText(/Nothing ran in this range/)).toBeNull()
        expect(
            document.querySelector('[data-slot="agent-skeleton"]'),
        ).not.toBeNull()

        next.resolve(await json(showFor(showUrls(fetchMock).at(-1) ?? '')))
        await figures()
    })
})

const metricOf = (label: string) => {
    const found = [
        ...(strip()?.querySelectorAll('[data-slot="metric"]') ?? []),
    ].find((element) => element.querySelector('dt')?.textContent === label)

    if (!(found instanceof HTMLElement)) {
        throw new Error(`No metric called ${label}.`)
    }

    return found
}

describe('changing the agent', () => {
    it('shows nothing of the previous agent’s figures while the next loads', async () => {
        const next = deferred()
        mockApi({
            show: (url) =>
                paramsOf(url).name === 'Beta'
                    ? next.promise
                    : json(showFor(url)),
        })

        renderApp(route('Alpha'))
        await figures()
        expect(valueOf('Traces')).toBe('23')

        await goTo(route('Beta'))

        await screen.findByRole('heading', { level: 1, name: 'Beta' })

        expect(strip()).toBeNull()
        expect(
            document.querySelector('[data-slot="agent-skeleton"]'),
        ).not.toBeNull()
        expect(screen.queryByText('Alpha')).toBeNull()
        expect(document.title).toBe('Beta · Trail')
        expect(
            screen
                .queryAllByRole('link')
                .filter((link) => link.getAttribute('href')?.includes('Alpha')),
        ).toEqual([])
    })

    it('does not carry the failure of one agent to the next', async () => {
        mockApi({
            show: (url) =>
                paramsOf(url).name === 'Broken'
                    ? json({ message: 'Down.' }, 500)
                    : json(showFor(url)),
        })

        renderApp(route('Broken'))
        await screen.findByRole('alert')

        await goTo(route('Fine'))
        await figures()

        expect(screen.queryByRole('alert')).toBeNull()
        expect(
            screen.getByRole('heading', { level: 1, name: 'Fine' }),
        ).toBeVisible()
    })

    it('does not show the previous agent’s not-found for the next', async () => {
        mockApi({
            show: (url) =>
                paramsOf(url).name === 'Ghost'
                    ? json({ message: 'Not found.' }, 404)
                    : json(showFor(url)),
        })

        renderApp(route('Ghost'))
        await screen.findByRole('heading', { name: 'This agent was not found' })

        await goTo(route('Real'))
        await figures()

        expect(screen.queryByText('This agent was not found')).toBeNull()
    })

    it('shows the failure of the agent it belongs to, and nothing of the one before', async () => {
        mockApi({
            show: (url) =>
                paramsOf(url).name === 'Broken'
                    ? json({ message: 'Down.' }, 500)
                    : json(showFor(url)),
        })

        renderApp(route('Fine'))
        await figures()

        await goTo(route('Broken'))
        await screen.findByRole('alert')

        expect(strip()).toBeNull()
        expect(
            screen.getByRole('heading', { level: 1, name: 'Broken' }),
        ).toBeVisible()
    })
})

describe('refreshing by itself', () => {
    const fakeInterval = () =>
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    async function tick() {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(refreshEvery)
        })
    }

    /** The fixture as it is: one run is running. */
    const running = (url: string) =>
        json({
            ...showFixture,
            data: {
                ...showFixture.data,
                agent: {
                    ...showFixture.data.agent,
                    name: paramsOf(url).name ?? '',
                },
            },
            range: { ...showFixture.range, preset: '24h' },
        })

    it('asks again every two seconds while a run is running, the models and tools and the runs with it, and stops when none is', async () => {
        fakeInterval()
        let quiet = false
        const fetchMock = mockApi({
            show: (url) => (quiet ? json(showFor(url)) : running(url)),
        })

        renderApp(route('SupportAssistant'))
        await figures()
        await until(() => expect(breakdownUrls(fetchMock)).toHaveLength(1))
        await until(() => expect(traceUrls(fetchMock)).toHaveLength(1))

        await tick()
        await until(() => expect(showUrls(fetchMock)).toHaveLength(2))
        await until(() => expect(breakdownUrls(fetchMock)).toHaveLength(2))
        await until(() => expect(traceUrls(fetchMock)).toHaveLength(2))

        quiet = true
        await tick()
        await until(() => expect(showUrls(fetchMock)).toHaveLength(3))
        await until(() => expect(breakdownUrls(fetchMock)).toHaveLength(3))
        await until(() => expect(traceUrls(fetchMock)).toHaveLength(3))

        await tick()
        await tick()
        await tick()

        expect(showUrls(fetchMock)).toHaveLength(3)
        expect(breakdownUrls(fetchMock)).toHaveLength(3)
        expect(traceUrls(fetchMock)).toHaveLength(3)
    })

    it('never asks again when nothing is running', async () => {
        fakeInterval()
        const fetchMock = mockApi()

        renderApp(route('SupportAssistant'))
        await figures()
        await until(() => expect(breakdownUrls(fetchMock)).toHaveLength(1))
        await until(() => expect(traceUrls(fetchMock)).toHaveLength(1))

        await tick()
        await tick()

        expect(showUrls(fetchMock)).toHaveLength(1)
        expect(breakdownUrls(fetchMock)).toHaveLength(1)
        expect(traceUrls(fetchMock)).toHaveLength(1)
    })

    it('keeps what is shown and says the last refresh failed, with a way to try again once asking has stopped', async () => {
        fakeInterval()
        let fail = false
        const fetchMock = mockApi({
            show: (url) =>
                fail ? json({ message: 'Down.' }, 500) : running(url),
        })

        renderApp(route('SupportAssistant'))
        await figures()
        fail = true

        await tick()
        await until(() => expect(showUrls(fetchMock)).toHaveLength(2))
        await screen.findByText('The last refresh failed; trying again.')

        expect(valueOf('Traces')).toBe('23')
        expect(screen.queryByRole('alert')).toBeNull()

        for (let failed = 2; failed <= maxFailedRefreshes; failed++) {
            await tick()
            await until(() =>
                expect(showUrls(fetchMock)).toHaveLength(1 + failed),
            )
        }

        await screen.findByText('Refreshing stopped after repeated failures.')

        expect(valueOf('Traces')).toBe('23')

        const asked = showUrls(fetchMock).length

        await tick()
        await tick()
        expect(showUrls(fetchMock)).toHaveLength(asked)

        fail = false
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
        await waitFor(() =>
            expect(screen.queryByText(/Refreshing stopped/)).toBeNull(),
        )
        await until(() =>
            expect(showUrls(fetchMock).length).toBeGreaterThan(asked),
        )
    })
})
