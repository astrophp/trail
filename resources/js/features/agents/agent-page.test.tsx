import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetAgentRefreshFailures } from '@/features/agents/use-agent'
import { forgetBreakdownRefreshFailures } from '@/features/agents/use-agent-breakdown'
import { forgetRecentTracesRefreshFailures } from '@/features/traces'
import { agentPath } from '@/lib/agent-path'
import { renderApp } from '@/test/render-app'
import {
    breakdownUrls,
    delegating,
    json,
    mockApi,
    paramsOf,
    queryOf,
    showFor,
    showUrls,
    strip,
    traceUrls,
} from '@/test/agent-page-api'

beforeEach(() => {
    forgetAgentRefreshFailures()
    forgetBreakdownRefreshFailures()
    forgetRecentTracesRefreshFailures()
})

afterEach(() => {
    vi.useRealTimers()
})

/** Opens an agent's page and waits for its figures. */
async function open(
    name = 'SupportAssistant',
    options: { range?: '1h' | '24h' | '7d'; chart?: string } = {},
) {
    const query = new URLSearchParams()

    if (options.range !== undefined) {
        query.set('range', options.range)
    }

    if (options.chart !== undefined) {
        query.set('chart', options.chart)
    }

    const [path, own] = agentPath(name).split('?')

    renderApp(`${path}?${own}${query.size > 0 ? `&${query}` : ''}`)
    await screen.findByText('Estimated cost')
}

const metric = (label: string) => {
    const found = [
        ...(strip()?.querySelectorAll('[data-slot="metric"]') ?? []),
    ].find((element) => element.querySelector('dt')?.textContent === label)

    if (!(found instanceof HTMLElement)) {
        throw new Error(`No metric called ${label}.`)
    }

    return found
}

const hrefOf = (label: string) =>
    within(metric(label)).getByRole('link').getAttribute('href')

const trail = () => screen.getByRole('navigation', { name: 'breadcrumb' })

describe('an agent with runs of its own', () => {
    it('is headed by its name, with its class and how it runs under it', async () => {
        mockApi()
        await open()

        expect(
            screen.getByRole('heading', { level: 1, name: 'SupportAssistant' }),
        ).toBeVisible()
        expect(
            screen.getByText('App\\Ai\\Agents\\SupportAssistant'),
        ).toBeVisible()
        expect(screen.getByText(/Runs on its own$/)).toBeVisible()
        expect(screen.queryByText(/as a sub-agent/)).toBeNull()
        expect(screen.getByRole('img', { name: 'Agent run' })).toBeVisible()
    })

    it('says it also runs as a sub-agent when it was delegated to, and how many delegated runs', async () => {
        mockApi({ show: (url) => json(showFor(url, delegating)) })
        await open()

        expect(
            screen.getByText(/Runs on its own and as a sub-agent/),
        ).toBeVisible()
        expect(
            within(metric('Traces')).getByText('12 delegated runs'),
        ).toBeVisible()
    })

    it('says nothing about delegated runs when there were none', async () => {
        mockApi()
        await open()

        expect(within(metric('Traces')).queryByText(/delegated/)).toBeNull()
    })

    it('calls an embeddings agent that, and not a run that runs on its own', async () => {
        mockApi({
            show: (url) => json(showFor(url, { agent: { type: 'embedding' } })),
        })
        await open()

        expect(screen.getByText('Embeddings')).toBeVisible()
        expect(screen.queryByText(/Runs on its own/)).toBeNull()
        expect(screen.getByRole('img', { name: 'Embedding run' })).toBeVisible()
    })

    it('names the page in the breadcrumb and the tab after the agent, and the crumb leads to the agents', async () => {
        mockApi()
        await open('Support/1')

        expect(within(trail()).getByText('Support/1')).toBeVisible()
        expect(
            within(trail()).getByRole('link', { name: 'Agents' }),
        ).toHaveAttribute('href', '/trail/agents')
        expect(document.title).toBe('Support/1 · Trail')
    })

    it('draws the four figures, each linking to the agent’s runs', async () => {
        mockApi()
        await open('Support/1')

        expect([
            'Traces',
            'Error rate',
            'p95 duration',
            'Estimated cost',
        ]).toEqual(
            [...(strip()?.querySelectorAll('dt') ?? [])].map(
                (term) => term.textContent,
            ),
        )
        expect(hrefOf('Traces')).toBe('/trail/traces?agent=Support%2F1')
        expect(hrefOf('Error rate')).toBe(
            '/trail/traces?status=failed&agent=Support%2F1',
        )
        expect(hrefOf('p95 duration')).toBe(
            '/trail/traces?agent=Support%2F1&slow=1',
        )
        expect(hrefOf('Estimated cost')).toBe(
            '/trail/traces?sort=-cost&agent=Support%2F1',
        )
    })

    it('shows the percentile its summary has, with the average beside it', async () => {
        mockApi()
        await open()

        expect(metric('p95 duration')).toHaveTextContent('1.90s')
        expect(metric('p95 duration')).toHaveTextContent('avg 1.09s')
        expect(metric('p95 duration').querySelector('dt')).toHaveTextContent(
            'p95 duration',
        )
    })

    it('shows the average under its own name, with no link, below the minimum of measured runs', async () => {
        mockApi({
            show: (url) =>
                json(
                    showFor(url, {
                        summary: {
                            duration: {
                                average_ms: 800,
                                p95_ms: null,
                                measured: 4,
                                not_measured: 0,
                                p95_minimum: 20,
                            },
                        },
                    }),
                ),
        })
        await open()

        expect(metric('Avg duration')).toHaveTextContent('800 ms')
        expect(metric('Avg duration')).toHaveTextContent(
            'p95 needs 20 measured runs · 4 so far',
        )
        expect(within(metric('Avg duration')).queryByRole('link')).toBeNull()
        expect(strip()).not.toHaveTextContent('p95 duration')
    })

    it('compares each figure with the previous period, and says when there is none', async () => {
        mockApi({ show: (url) => json(showFor(url, { previous: null })) })
        await open()

        expect(strip()).not.toHaveTextContent('vs previous')
        expect(
            screen.getByText('No runs were recorded in the previous 24 hours'),
        ).toBeVisible()
    })
})

describe('a time range other than the default', () => {
    it('is carried by every link the page draws, and by the requests', async () => {
        const fetchMock = mockApi({ breakdown: undefined })
        await open('SupportAssistant', { range: '7d' })
        await screen.findByRole('link', { name: /View all/ })

        expect(paramsOf(showUrls(fetchMock).at(-1))).toMatchObject({
            name: 'SupportAssistant',
            range: '7d',
        })
        expect(paramsOf(breakdownUrls(fetchMock).at(-1)).range).toBe('7d')
        expect(paramsOf(traceUrls(fetchMock).at(-1))).toMatchObject({
            range: '7d',
            agent: 'SupportAssistant',
            per_page: '8',
            sort: '-started_at',
        })

        const links = [...document.querySelectorAll('main a')]
            .map((link) => link.getAttribute('href') ?? '')
            .filter((href) => href.startsWith('/trail/traces?'))

        expect(links.length).toBeGreaterThanOrEqual(10)

        for (const href of links) {
            expect(
                new URL(href, 'http://x').searchParams.get('range'),
                href,
            ).toBe('7d')
        }
    })

    it('puts the range and the agent on the way to all its traces', async () => {
        mockApi()
        await open('Support/1', { range: '7d' })

        expect(
            screen.getByRole('link', { name: 'View all traces' }),
        ).toHaveAttribute('href', '/trail/traces?range=7d&agent=Support%2F1')
    })
})

describe('the name in the address', () => {
    it.each([
        ['a slash', 'Support/Bot'],
        ['a space at the start', ' Support'],
        ['a space at the end', 'Support '],
        ['a percent sign', '100% Agent'],
        ['a plus', 'C++ Helper'],
        ['unicode', 'Ünï Agént ✓'],
        ['all of it', ' a/b %c+d é '],
    ])('is asked for exactly as it is spelled, with %s', async (_, name) => {
        const fetchMock = mockApi()

        await open(name)

        expect(queryOf(showUrls(fetchMock)[0] ?? '').get('name')).toBe(name)
        expect(queryOf(breakdownUrls(fetchMock)[0] ?? '').get('name')).toBe(
            name,
        )
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(name)
        expect(
            screen.getByRole('link', { name: 'View all traces' }),
        ).toHaveAttribute(
            'href',
            `/trail/traces?${new URLSearchParams({ agent: name })}`,
        )
        expect(queryOf(traceUrls(fetchMock)[0] ?? '').get('agent')).toBe(name)
    })

    it('is the stored spelling the response gives, in the heading and in every link', async () => {
        mockApi({
            show: (url) =>
                json(showFor(url, { agent: { name: 'SupportAssistant' } })),
        })
        await open('supportassistant')

        expect(
            screen.getByRole('heading', { level: 1, name: 'SupportAssistant' }),
        ).toBeVisible()
        expect(hrefOf('Traces')).toBe('/trail/traces?agent=SupportAssistant')
        expect(document.title).toBe('SupportAssistant · Trail')
    })

    it('is a plus that the address writes as a plus, which a plus in an address means a space', async () => {
        const fetchMock = mockApi()

        renderApp('/agents/agent?name=a+b')
        await screen.findByText('Estimated cost')

        expect(queryOf(showUrls(fetchMock)[0] ?? '').get('name')).toBe('a b')
    })
})

describe('what needs attention', () => {
    it('links each cell and each issue kind to exactly the runs the API counted, over the range of the data', async () => {
        mockApi()
        await open('Support/Bot', { range: '7d' })

        const section = (
            await screen.findByRole('heading', { name: 'Needs attention' })
        ).closest('[data-slot="panel"]') as HTMLElement
        const hrefs = within(section)
            .getAllByRole('link')
            .map((link) =>
                Object.fromEntries(
                    new URL(link.getAttribute('href') ?? '', 'http://x')
                        .searchParams,
                ),
            )

        expect(hrefs).toEqual([
            { range: '7d', status: 'failed', agent: 'Support/Bot' },
            {
                range: '7d',
                status: 'failed',
                agent: 'Support/Bot',
                issue_kind: 'rate_limited',
            },
            { range: '7d', agent: 'Support/Bot', unpriced: '1' },
            { range: '7d', agent: 'Support/Bot', recovered: '1' },
        ])
    })

    it('says nothing needs attention for an agent whose runs are all well, and does not add another panel for the failures by kind', async () => {
        mockApi({ show: (url) => json(showFor(url, { attention: [] })) })
        await open()

        expect(
            await screen.findByText('Nothing needs attention in this range'),
        ).toBeVisible()
        expect(screen.queryByText(/by issue kind|Failures by/i)).toBeNull()
    })

    it('draws an item it cannot link as one that could not be shown, with no link to other runs', async () => {
        const report = vi.spyOn(console, 'error').mockImplementation(() => {})

        mockApi({
            show: (url) =>
                json({
                    ...showFor(url),
                    data: {
                        ...showFor(url).data,
                        attention: [
                            {
                                kind: 'failed',
                                count: 2,
                                latest_at: null,
                                filters: { agent: 'A', unknown: '1' },
                                breakdown: [],
                            },
                        ],
                    },
                }),
        })
        await open()

        expect(
            await screen.findByText(/This item could not be shown/),
        ).toBeVisible()
        expect(
            within(
                screen
                    .getByRole('heading', { name: 'Needs attention' })
                    .closest('[data-slot="panel"]') as HTMLElement,
            ).queryByRole('link'),
        ).toBeNull()
        report.mockRestore()
    })
})

describe('the chart mode', () => {
    it('is kept in the address, and every other part of the address stays', async () => {
        mockApi()
        await open('Support/1', { range: '7d' })

        await userEvent.click(screen.getByRole('radio', { name: 'Cost' }))
        await waitFor(() =>
            expect(
                Object.fromEntries(new URLSearchParams(window.location.search)),
            ).toEqual({ name: 'Support/1', range: '7d', chart: 'cost' }),
        )

        expect(screen.getByRole('radio', { name: 'Cost' })).toBeChecked()
    })

    it('is read from the address', async () => {
        mockApi()
        await open('SupportAssistant', { chart: 'duration' })

        expect(screen.getByRole('radio', { name: 'Duration' })).toBeChecked()
        await waitFor(() =>
            expect(
                screen.getByText(
                    'Average duration of the traces started per hour',
                ),
            ).toBeVisible(),
        )
    })
})
