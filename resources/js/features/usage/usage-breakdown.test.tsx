import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tracesLinkers } from '@/api/traces-link'
import { forgetUsageRefreshFailures } from '@/features/usage/use-usage'
import { forgetUsageBreakdownRefreshFailures } from '@/features/usage/use-usage-breakdown'
import { formatCost } from '@/lib/format'
import type { TimeRangePreset } from '@/lib/time-range'
import { renderApp } from '@/test/render-app'
import {
    agentRow,
    agentRows,
    breakdownFor,
    breakdownOf,
    breakdownUrls,
    cellOf,
    claude,
    dataRows,
    deferred,
    expectSearch,
    gpt,
    header,
    hasColumn,
    json,
    lastBreakdownUrl,
    llama,
    mockQuietApi,
    modelRow,
    modelRows,
    paramsOf,
    rowOf,
    rowsLoaded,
    sortButton,
    tab,
    table,
    travel,
} from '@/test/usage-api'

beforeEach(() => {
    forgetUsageRefreshFailures()
    forgetUsageBreakdownRefreshFailures()
})

const never = () => new Promise<Response>(() => {})
const open = async (route = '/usage') => {
    renderApp(route)
    await rowsLoaded()
}

/** Where a row of the breakdown should lead: the traces list over the row's filters and the range. */
function hrefFor(range: TimeRangePreset, filters: Record<string, string>) {
    const to = tracesLinkers().linkFor(range, filters)

    if (typeof to === 'string') {
        throw new Error('Expected a location.')
    }

    return `/trail${to.pathname}${to.search}`
}

const hrefOfRow = (text: string) =>
    within(rowOf(text)).getByRole('link').getAttribute('href')

describe('the breakdown by model', () => {
    it('asks for the default view explicitly and draws a row per model with its provider', async () => {
        const fetchMock = mockQuietApi()
        await open()

        expect(breakdownUrls(fetchMock)).toEqual([
            '/trail/api/usage/breakdown?range=24h&by=model&sort=-cost&page=1',
        ])
        expect(tab('By model')).toHaveAttribute('aria-selected', 'true')
        expect(header('Model')).toBeInTheDocument()
        expect(dataRows()).toHaveLength(3)

        const row = rowOf('claude-sonnet-4-5')

        expect(row).toHaveTextContent('anthropic')
        expect(cellOf(row, 'Runs')).toHaveTextContent('120')
        expect(cellOf(row, 'Steps')).toHaveTextContent('310')
        expect(cellOf(row, 'Input tokens')).toHaveTextContent('650,500')
        expect(cellOf(row, 'Output tokens')).toHaveTextContent('136,500')
    })

    it('leads each row to the runs it counted, over the page’s range', async () => {
        mockQuietApi()
        await open('/usage?range=7d')

        expect(hrefOfRow('claude-sonnet-4-5')).toBe(
            hrefFor('7d', {
                provider: 'anthropic',
                model: 'claude-sonnet-4-5',
            }),
        )
        // The target itself, so a linker that dropped a filter fails here as well.
        expect(hrefOfRow('claude-sonnet-4-5')).toBe(
            '/trail/traces?range=7d&provider=anthropic&model=claude-sonnet-4-5',
        )
        expect(hrefOfRow('gpt-4.1')).toBe(
            hrefFor('7d', { provider: 'openai', model: 'gpt-4.1' }),
        )
    })
})

describe('the other views', () => {
    it('groups by top-level agent, with the agent’s icon and name, and leads to its runs', async () => {
        const fetchMock = mockQuietApi()
        await open()

        await userEvent.click(tab('By top-level agent'))
        await waitFor(() => expect(header('Agent')).toBeInTheDocument())
        await expectSearch('?by=agent')

        expect(lastBreakdownUrl(fetchMock)).toBe(
            '/trail/api/usage/breakdown?range=24h&by=agent&sort=-cost&page=1',
        )
        expect(tab('By top-level agent')).toHaveAttribute(
            'aria-selected',
            'true',
        )

        const row = await waitFor(() => rowOf('SupportAssistant'))

        expect(
            within(row).getByRole('img', { name: 'Agent run' }),
        ).toBeVisible()
        expect(hrefOfRow('SupportAssistant')).toBe(
            hrefFor('24h', { agent: 'SupportAssistant' }),
        )
        expect(hrefOfRow('SupportAssistant')).toBe(
            '/trail/traces?agent=SupportAssistant',
        )
        expect(hrefOfRow('Research Agent')).toBe(
            hrefFor('24h', { agent: 'Research Agent' }),
        )
    })

    it('groups by provider, with the provider’s name, and leads to its runs', async () => {
        const fetchMock = mockQuietApi()
        await open()

        await userEvent.click(tab('By provider'))
        await waitFor(() => expect(header('Provider')).toBeInTheDocument())
        await expectSearch('?by=provider')

        expect(lastBreakdownUrl(fetchMock)).toBe(
            '/trail/api/usage/breakdown?range=24h&by=provider&sort=-cost&page=1',
        )

        const row = await waitFor(() => rowOf('anthropic'))

        expect(within(row).getByRole('link')).toHaveTextContent(/^anthropic$/)
        expect(hrefOfRow('anthropic')).toBe('/trail/traces?provider=anthropic')
        expect(dataRows()).toHaveLength(3)
    })

    it('shows no rows of the previous grouping while the next one loads', async () => {
        const fetchMock = mockQuietApi()
        await open()

        const next = deferred()
        fetchMock.mockImplementation((url) =>
            url.includes('/api/meta')
                ? json({})
                : url.includes('/api/usage/breakdown')
                  ? next.promise
                  : json({}),
        )
        await userEvent.click(tab('By provider'))

        await waitFor(() =>
            expect(table()).toHaveAttribute('aria-busy', 'true'),
        )
        expect(screen.queryByText('claude-sonnet-4-5')).not.toBeInTheDocument()
        expect(tab('By provider')).toHaveAttribute('aria-selected', 'true')
    })
})

describe('the view in the address', () => {
    it('leaves the default view and sort out of the address, and puts the others in', async () => {
        mockQuietApi()
        await open()

        expect(window.location.search).toBe('')

        await userEvent.click(tab('By provider'))
        await expectSearch('?by=provider')

        await userEvent.click(tab('By model'))
        await expectSearch('')
    })

    it('restores the view and the sort from the address, and asks for exactly them', async () => {
        const fetchMock = mockQuietApi()
        renderApp('/usage?range=7d&by=provider&sort=-runs')
        await rowsLoaded()

        expect(breakdownUrls(fetchMock)).toEqual([
            '/trail/api/usage/breakdown?range=7d&by=provider&sort=-runs&page=1',
        ])
        expect(tab('By provider')).toHaveAttribute('aria-selected', 'true')
        expect(tab('By model')).toHaveAttribute('aria-selected', 'false')
        expect(header('Runs')).toHaveAttribute('aria-sort', 'descending')
        expect(header('Provider')).toHaveAttribute('aria-sort', 'none')
    })

    it('falls back to the defaults for a view or a sort it does not know', async () => {
        const fetchMock = mockQuietApi()
        renderApp('/usage?by=team&sort=spend')
        await rowsLoaded()

        expect(breakdownUrls(fetchMock)).toEqual([
            '/trail/api/usage/breakdown?range=24h&by=model&sort=-cost&page=1',
        ])
        expect(tab('By model')).toHaveAttribute('aria-selected', 'true')
    })

    it('returns to page 1 in the same history entry when the view changes', async () => {
        mockQuietApi((url) =>
            json(
                breakdownOf('model', modelRows, {
                    page: Number(paramsOf(url).page ?? 1),
                    total: 60,
                }),
            ),
        )
        renderApp('/usage?sort=name&page=2')
        await screen.findByText('Page 2 of 3')

        await userEvent.click(tab('By provider'))
        await expectSearch('?by=provider&sort=name')

        // One entry: Back lands on the page the person came from, not on a page number of another view.
        await travel('back')
        await expectSearch('?sort=name&page=2')
    })
})

describe('sorting', () => {
    it('sorts by the column the person clicks, first descending for a figure and ascending for a name', async () => {
        const fetchMock = mockQuietApi()
        await open()

        expect(header('Est. cost')).toHaveAttribute('aria-sort', 'descending')

        await userEvent.click(sortButton('Runs'))
        await expectSearch('?sort=-runs')
        await waitFor(() =>
            expect(lastBreakdownUrl(fetchMock)).toBe(
                '/trail/api/usage/breakdown?range=24h&by=model&sort=-runs&page=1',
            ),
        )
        expect(header('Runs')).toHaveAttribute('aria-sort', 'descending')

        await userEvent.click(sortButton('Runs'))
        await expectSearch('?sort=runs')

        await userEvent.click(sortButton('Tokens'))
        await expectSearch('?sort=-tokens')

        await userEvent.click(sortButton('Model'))
        await expectSearch('?sort=name')
        expect(lastBreakdownUrl(fetchMock)).toContain('sort=name&')
    })

    it('keeps the previous rows, dimmed, while the next sort loads', async () => {
        const fetchMock = mockQuietApi()
        await open()

        const next = deferred()
        fetchMock.mockImplementation((url) =>
            url.includes('/api/usage/breakdown')
                ? next.promise
                : json({ data: [] }),
        )
        await userEvent.click(sortButton('Runs'))

        await waitFor(() =>
            expect(table()).toHaveAttribute('aria-busy', 'true'),
        )
        expect(dataRows()).toHaveLength(3)
        expect(screen.getByText('Loading the breakdown')).toBeInTheDocument()

        next.resolve(
            new Response(
                JSON.stringify(breakdownOf('model', [gpt, claude, llama])),
            ),
        )
        await waitFor(() => expect(table()).not.toHaveAttribute('aria-busy'))
        expect(within(dataRows()[0]).getByRole('link')).toHaveTextContent(
            'gpt-4.1',
        )
    })
})

describe('what a row says about its cost and coverage', () => {
    it('labels a partly priced row through the cost component, and counts the steps left out', async () => {
        mockQuietApi()
        await open()

        const row = rowOf('claude-sonnet-4-5')
        const cost = cellOf(row, 'Est. cost')

        expect(cost).toHaveTextContent(formatCost(3.7603))
        expect(cost).toHaveTextContent('Partial')
        expect(cellOf(row, 'Coverage')).toHaveTextContent(
            '4 of 300 steps unpriced',
        )
        expect(cellOf(row, 'Coverage')).toHaveTextContent('9,100 tokens')
    })

    it('shows an unpriced row as Unpriced, never as a zero amount, and leaves the tokens out when they are not known', async () => {
        mockQuietApi()
        await open()

        const row = rowOf('llama-3.3')

        expect(cellOf(row, 'Est. cost')).toHaveTextContent(/^Unpriced$/)
        expect(row).not.toHaveTextContent('$0')
        expect(cellOf(row, 'Coverage')).toHaveTextContent(
            /^12 of 12 steps unpriced$/,
        )
    })

    it('says a fully priced row is priced, and has nothing to count', async () => {
        mockQuietApi()
        await open()

        const row = rowOf('gpt-4.1')

        expect(cellOf(row, 'Est. cost')).toHaveTextContent(formatCost(1.25))
        expect(cellOf(row, 'Coverage')).toHaveTextContent(/^Priced$/)
    })

    it('says a row that reported no usage did not, rather than calling it priced', async () => {
        mockQuietApi(() =>
            json(
                breakdownOf('model', [
                    modelRow('openai', 'gpt-4.1', {
                        usage: {
                            state: 'not_reported',
                            input_tokens: null,
                            output_tokens: null,
                            cache_read_tokens: null,
                            cache_write_tokens: null,
                            reasoning_tokens: null,
                            total_tokens: null,
                        },
                        cost: { state: 'not_captured', amount: null },
                        coverage: {
                            reported_steps: 0,
                            unpriced_steps: 0,
                            unpriced_tokens: 0,
                        },
                    }),
                ]),
            ),
        )
        await open()

        const row = rowOf('gpt-4.1')

        expect(cellOf(row, 'Coverage')).toHaveTextContent('No usage reported')
        expect(cellOf(row, 'Est. cost')).toHaveTextContent('Not captured')
        expect(cellOf(row, 'Tokens')).toHaveTextContent('Not reported')
    })

    it('shows the amount so far for a row with a step still running, and no final tokens', async () => {
        mockQuietApi(() =>
            json(
                breakdownOf('model', [
                    modelRow('openai', 'gpt-4.1', {
                        cost: { state: 'pending', amount: 0.4 },
                        usage: {
                            state: 'pending',
                            input_tokens: 10,
                            output_tokens: 5,
                            cache_read_tokens: null,
                            cache_write_tokens: null,
                            reasoning_tokens: null,
                            total_tokens: 15,
                        },
                    }),
                ]),
            ),
        )
        await open()

        const row = rowOf('gpt-4.1')

        expect(cellOf(row, 'Est. cost')).toHaveTextContent('So far')
        expect(cellOf(row, 'Tokens')).toHaveTextContent('Pending')
        expect(cellOf(row, 'Input tokens')).toHaveTextContent('Pending')
    })
})

describe('the token columns', () => {
    it('draws a column only when some row of the page reported it', async () => {
        mockQuietApi()
        await open()

        // One model reported cache reads; none reported cache writes or reasoning.
        expect(hasColumn('Cache read')).toBe(true)
        expect(hasColumn('Cache write')).toBe(false)
        expect(hasColumn('Reasoning')).toBe(false)
        expect(
            cellOf(rowOf('claude-sonnet-4-5'), 'Cache read'),
        ).toHaveTextContent('90,000')
        // A row that did not report it says so in the column other rows reported.
        expect(cellOf(rowOf('gpt-4.1'), 'Cache read')).toHaveTextContent(
            'Not reported',
        )
    })

    it('draws the column once a row reports it', async () => {
        mockQuietApi(() =>
            json(
                breakdownOf('model', [
                    claude,
                    modelRow('openai', 'o3', {
                        usage: {
                            state: 'reported',
                            input_tokens: 100,
                            output_tokens: 900,
                            cache_read_tokens: null,
                            cache_write_tokens: 40,
                            reasoning_tokens: 700,
                            total_tokens: 1000,
                        },
                    }),
                ]),
            ),
        )
        await open()

        expect(hasColumn('Cache write')).toBe(true)
        expect(hasColumn('Reasoning')).toBe(true)
        expect(cellOf(rowOf('o3'), 'Reasoning')).toHaveTextContent('700')
        expect(cellOf(rowOf('o3'), 'Cache write')).toHaveTextContent('40')
    })

    it('always draws input and output, saying so when nothing was reported', async () => {
        mockQuietApi(() =>
            json(
                breakdownOf('model', [
                    modelRow('openai', 'gpt-4.1', {
                        usage: {
                            state: 'not_reported',
                            input_tokens: null,
                            output_tokens: null,
                            cache_read_tokens: null,
                            cache_write_tokens: null,
                            reasoning_tokens: null,
                            total_tokens: null,
                        },
                    }),
                ]),
            ),
        )
        await open()

        const row = rowOf('gpt-4.1')

        expect(hasColumn('Input tokens')).toBe(true)
        expect(hasColumn('Output tokens')).toBe(true)
        expect(hasColumn('Cache read')).toBe(false)
        expect(cellOf(row, 'Input tokens')).toHaveTextContent('Not reported')
        expect(cellOf(row, 'Output tokens')).toHaveTextContent('Not reported')
    })
})

describe('a row whose runs cannot be linked', () => {
    it('is no link, still shows its figures and says so, and the other rows keep theirs', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        const stray = modelRow('acme', 'mystery-1', {
            // A filter the traces list does not keep in its address.
            filters: { tenant: 'acme' },
        })
        const bare = agentRow('Bare', { filters: {} })

        mockQuietApi((url) =>
            json(
                paramsOf(url).by === 'agent'
                    ? breakdownOf('agent', [bare, ...agentRows])
                    : breakdownOf('model', [stray, gpt]),
            ),
        )
        await open()

        const row = rowOf('mystery-1')

        expect(within(row).queryByRole('link')).toBeNull()
        expect(row).toHaveTextContent('Its runs could not be linked')
        expect(cellOf(row, 'Runs')).toHaveTextContent('120')
        // The row beside it still leads to its runs.
        expect(hrefOfRow('gpt-4.1')).toBe(
            hrefFor('24h', { provider: 'openai', model: 'gpt-4.1' }),
        )
        expect(error).toHaveBeenCalledWith(
            expect.stringContaining('Trail could not link every usage row'),
        )

        // A row that names no filter would lead to every run: it is not a link either.
        await userEvent.click(tab('By top-level agent'))
        await waitFor(() => expect(rowOf('Bare')).toBeInTheDocument())

        expect(within(rowOf('Bare')).queryByRole('link')).toBeNull()
        expect(rowOf('Bare')).toHaveTextContent('Its runs could not be linked')
        expect(hrefOfRow('SupportAssistant')).toBe(
            hrefFor('24h', { agent: 'SupportAssistant' }),
        )
    })

    it('is no link for an agent with no name, which the list would read as every agent', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        mockQuietApi(() =>
            json(breakdownOf('agent', [agentRow(''), agentRow('Research')])),
        )
        await open('/usage?by=agent')

        const row = rowOf('Unnamed agent')

        expect(within(row).queryByRole('link')).toBeNull()
        expect(row).toHaveTextContent('Its runs could not be linked')
        expect(within(rowOf('Research')).getByRole('link')).toBeVisible()
    })
})

describe('pages', () => {
    const sixty = (url: string) =>
        json(
            breakdownOf('model', modelRows, {
                page: Number(paramsOf(url).page ?? 1),
                total: 60,
            }),
        )

    it('pages through the rows with the shared pagination, in the address', async () => {
        const fetchMock = mockQuietApi(sixty)
        await open()

        expect(screen.getByText('Page 1 of 3')).toBeVisible()

        await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
        await expectSearch('?page=2')
        await screen.findByText('Page 2 of 3')

        expect(lastBreakdownUrl(fetchMock)).toBe(
            '/trail/api/usage/breakdown?range=24h&by=model&sort=-cost&page=2',
        )
    })

    it('draws no pagination when everything fits on one page', async () => {
        mockQuietApi()
        await open()

        expect(dataRows()).toHaveLength(3)
        expect(
            screen.queryByRole('navigation', { name: 'Pagination' }),
        ).not.toBeInTheDocument()
    })
})

describe('when the breakdown holds more groups than were read', () => {
    it('says the list may be incomplete', async () => {
        mockQuietApi(() =>
            json(breakdownOf('model', modelRows, { truncated: true })),
        )
        await open()

        expect(
            screen.getByText('Only part of the usage was read'),
        ).toBeVisible()
        expect(screen.getByText(/Trail read 1,000 groups/)).toBeVisible()
    })

    it('says nothing when every group was read', async () => {
        mockQuietApi()
        await open()

        expect(dataRows()).toHaveLength(3)
        expect(
            screen.queryByText('Only part of the usage was read'),
        ).not.toBeInTheDocument()
    })

    it('does not carry the previous view’s note over to the one that is loading', async () => {
        const fetchMock = mockQuietApi(() =>
            json(breakdownOf('model', modelRows, { truncated: true })),
        )
        await open()
        await screen.findByText('Only part of the usage was read')

        const next = deferred()
        fetchMock.mockImplementation((url) =>
            url.includes('/api/usage/breakdown') ? next.promise : json({}),
        )
        await userEvent.click(sortButton('Runs'))

        await waitFor(() =>
            expect(table()).toHaveAttribute('aria-busy', 'true'),
        )
        expect(
            screen.queryByText('Only part of the usage was read'),
        ).not.toBeInTheDocument()
    })
})

describe('an empty range', () => {
    it('says no usage was recorded, naming the range, and draws no table rows or pagination', async () => {
        mockQuietApi((url) =>
            json(
                breakdownOf('model', [], {
                    preset: paramsOf(url).range as TimeRangePreset,
                }),
            ),
        )
        renderApp('/usage?range=1h')

        expect(
            await screen.findByText('No recorded usage in this range'),
        ).toBeVisible()
        expect(
            screen.getByText(/Nothing was recorded in the last hour\./),
        ).toBeVisible()
        expect(
            screen.queryByRole('navigation', { name: 'Pagination' }),
        ).not.toBeInTheDocument()
        // The tabs stay, so another view can be tried.
        expect(tab('By provider')).toBeVisible()
    })

    it('does not claim a new range is empty because the previous one was', async () => {
        const fetchMock = mockQuietApi(() => json(breakdownOf('model', [])))
        renderApp('/usage?range=1h')
        await screen.findByText('No recorded usage in this range')

        fetchMock.mockImplementation((url) =>
            url.includes('/api/usage/breakdown')
                ? never()
                : json({ message: 'unused' }, 500),
        )
        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(
            screen.getByRole('option', { name: 'Last 24 hours' }),
        )

        await waitFor(() =>
            expect(table()).toHaveAttribute('aria-busy', 'true'),
        )
        expect(
            screen.queryByText('No recorded usage in this range'),
        ).not.toBeInTheDocument()
    })
})

describe('when the breakdown cannot be loaded', () => {
    it('shows the failure in the breakdown alone, with the tabs, and the totals stay', async () => {
        const fetchMock = mockQuietApi(() =>
            json({ message: 'The database is down.' }, 500),
        )
        renderApp('/usage')

        const alert = await screen.findByRole('alert')

        expect(alert).toHaveTextContent(
            'The usage breakdown could not be loaded',
        )
        expect(alert).toHaveTextContent(
            'The server answered with an error (500).',
        )
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
        expect(tab('By model')).toBeVisible()
        expect(await screen.findByText('Estimated cost')).toBeVisible()
        expect(breakdownUrls(fetchMock)).toHaveLength(1)
    })

    it('keeps the retry button while it runs, then shows the rows and moves focus to the page heading', async () => {
        const fetchMock = mockQuietApi(() => json({ message: 'Down.' }, 500))
        renderApp('/usage')
        await screen.findByRole('alert')

        const retry = deferred()
        fetchMock.mockImplementation((url) =>
            url.includes('/api/meta')
                ? json({})
                : url.includes('/api/usage/breakdown')
                  ? retry.promise
                  : json({}),
        )

        const button = screen.getByRole('button', { name: 'Try again' })
        button.focus()
        await userEvent.click(button)

        await waitFor(() => expect(breakdownUrls(fetchMock)).toHaveLength(2))

        expect(screen.getByRole('button', { name: 'Try again' })).toBe(button)
        expect(button).toHaveFocus()
        expect(screen.queryByRole('table')).not.toBeInTheDocument()

        retry.resolve(new Response(JSON.stringify(breakdownFor('?by=model'))))
        await rowsLoaded()

        expect(dataRows()).toHaveLength(3)
        expect(
            screen.getByRole('heading', { level: 1, name: 'Usage & cost' }),
        ).toHaveFocus()
    })

    it('does not leave another page’s rows up when the next page fails', async () => {
        const fetchMock = mockQuietApi((url) =>
            json(
                breakdownOf('model', modelRows, {
                    page: Number(paramsOf(url).page ?? 1),
                    total: 60,
                }),
            ),
        )
        await open()

        fetchMock.mockImplementation((url) =>
            url.includes('/api/usage/breakdown')
                ? json({ message: 'No.' }, 500)
                : json({}),
        )
        await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The usage breakdown could not be loaded',
        )
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
})
