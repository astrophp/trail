import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TraceListResponse } from '@/api/types'
import { contractFixture } from '@/test/contract-fixture'
import { renderApp, appReady } from '@/test/render-app'
import { travel } from '@/test/traces-api'

const fixture = contractFixture('traces') as TraceListResponse
const meta = contractFixture('meta')

const lastPage = 3

/** The list endpoint as the API answers it: three pages of the fixture's runs, and none past the end. */
function listFor(url: string): TraceListResponse {
    const page = Number(new URL(url, 'http://x').searchParams.get('page') ?? 1)

    return {
        ...fixture,
        data: page > lastPage ? [] : fixture.data,
        pagination: { page, per_page: 25, total: 60, last_page: lastPage },
    }
}

type Handler = (url: string) => Promise<Response>

const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))

const never = () => new Promise<Response>(() => {})

/** A response the test releases by hand. */
function deferred() {
    let resolve: (response: Response) => void = () => {}
    const promise = new Promise<Response>((done) => {
        resolve = done
    })

    return { promise, resolve }
}

/** Answers `/meta` with its fixture and `/traces` with `respond`. */
function mockApi(respond: Handler = (url) => json(listFor(url))) {
    const fetchMock = vi.fn<Handler>((url) =>
        url.includes('/api/meta') ? json(meta) : respond(url),
    )
    vi.stubGlobal('fetch', fetchMock)

    return fetchMock
}

/** From now on the list endpoint answers with `respond`. */
function answerWith(fetchMock: ReturnType<typeof mockApi>, respond: Handler) {
    fetchMock.mockImplementation((url) =>
        url.includes('/api/meta') ? json(meta) : respond(url),
    )
}

const traceUrls = (fetchMock: ReturnType<typeof mockApi>) =>
    fetchMock.mock.calls
        .map(([url]) => url)
        .filter((url) => url.includes('/api/traces'))

const lastTraceUrl = (fetchMock: ReturnType<typeof mockApi>) =>
    traceUrls(fetchMock).at(-1)

const emptyList = {
    ...fixture,
    data: [],
    pagination: { page: 1, per_page: 25, total: 0, last_page: 1 },
}

const dataRows = () => screen.getAllByRole('row').slice(1)
/** The row of a fixture run, found by the link to it. */
const rowOf = (id: string) =>
    within(screen.getByRole('table')).getByRole('row', {
        name: (_, element) =>
            element.querySelector(`a[href*="/traces/${id}"]`) !== null,
    })
const cellsOf = (id: string) =>
    within(rowOf(id))
        .getAllByRole('cell')
        .map((cell) => cell.textContent ?? '')
const header = (name: RegExp | string) =>
    screen.getByRole('columnheader', { name })
const sortButton = (name: RegExp | string) =>
    within(header(name)).getByRole('button')
const nextButton = () => screen.getByRole('button', { name: 'Next page' })
const expectSearch = (expected: string) =>
    waitFor(() => expect(window.location.search).toBe(expected))

/** The rows are in: the footer only exists once the answer has arrived. */
async function loaded() {
    await screen.findByRole('navigation', { name: 'Pagination' })
}

beforeEach(() => {
    mockApi()
})

describe('the Traces page', () => {
    it('asks for the default view explicitly and renders a row per run', async () => {
        const fetchMock = mockApi()
        renderApp('/traces')
        await loaded()

        expect(traceUrls(fetchMock)).toEqual([
            '/trail/api/traces?range=24h&sort=-started_at&page=1',
        ])
        expect(dataRows()).toHaveLength(fixture.data.length)
        expect(
            screen.getByRole('heading', { level: 1, name: 'Traces' }),
        ).toBeInTheDocument()
    })

    it('shows each run with its name, outcome and model', async () => {
        renderApp('/traces')
        await loaded()

        const completed = within(rowOf('0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30'))

        expect(
            completed.getByRole('link', { name: 'SupportAssistant' }),
        ).toBeVisible()
        expect(completed.getByText('Where is my order?')).toBeVisible()
        expect(completed.getByText('Completed')).toBeVisible()
        expect(completed.getByText('claude-sonnet-4-5')).toBeVisible()
        expect(completed.getByText('$0.0083')).toBeVisible()

        const failed = within(rowOf('trace-failed'))

        expect(failed.getByText('Failed')).toBeVisible()
        expect(failed.getByText('Rate limited')).toBeVisible()
        expect(
            within(rowOf('trace-embedding')).getByRole('img', {
                name: 'Embedding run',
            }),
        ).toBeVisible()
    })

    it('says why a value is missing instead of showing zero', async () => {
        renderApp('/traces')
        await loaded()

        // cells: outcome, model, duration, tokens, cost, started
        const running = cellsOf('trace-running-priced')
        expect(running[2]).toBe('In progress')
        expect(running[3]).toBe('Pending')
        expect(running[4]).toBe('Pending')

        expect(cellsOf('trace-unpriced')[4]).toBe('Unpriced')
        expect(cellsOf('trace-failed')[3]).toBe('Not reported')
        expect(cellsOf('trace-failed')[4]).toBe('Not captured')

        // The run that reported nothing: no model, duration, tokens or cost.
        const bare = cellsOf('trace-bare')
        expect(bare[1]).toBe('Not capturedNot captured')
        expect(bare[2]).toBe('Not captured')
        expect(bare[3]).toBe('Not reported')
        expect(bare[4]).toBe('Not captured')

        for (const cell of screen.getAllByRole('cell')) {
            expect(cell.textContent).not.toMatch(/^\s*(\$?0(\.0+)?|0 ?m?s)\s*$/)
        }
    })

    it('shows nothing under the name of a run that has no prompt', async () => {
        renderApp('/traces')
        await loaded()

        const cell = within(rowOf('trace-embedding')).getByRole('rowheader')

        expect(cell.querySelectorAll('p')).toHaveLength(0)
        expect(cell).toHaveTextContent(/^Embeddings/)
    })

    it('links each run name to its page', async () => {
        renderApp('/traces')
        await loaded()

        for (const trace of fixture.data) {
            expect(
                within(rowOf(trace.id)).getByRole('link', { name: trace.name }),
            ).toHaveAttribute('href', `/trail/traces/${trace.id}`)
        }
    })

    it('keeps the time range on the link to a run', async () => {
        renderApp('/traces?range=7d&sort=-cost')
        await loaded()

        expect(
            within(rowOf('trace-bare')).getByRole('link', { name: 'Bare' }),
        ).toHaveAttribute('href', '/trail/traces/trace-bare?range=7d')
    })
})

describe('the URL drives the view', () => {
    it('requests what the URL says and marks the sorted column', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?sort=-duration&page=2&range=7d')
        await loaded()

        expect(traceUrls(fetchMock)).toEqual([
            '/trail/api/traces?range=7d&sort=-duration&page=2',
        ])
        expect(header(/Duration/)).toHaveAttribute('aria-sort', 'descending')
        expect(header(/Started/)).toHaveAttribute('aria-sort', 'none')
        expect(screen.getByText('Page 2 of 3')).toBeVisible()
        expect(
            screen.getByRole('combobox', { name: 'Time range' }),
        ).toHaveTextContent('Last 7 days')
    })

    it('falls back to the defaults for an invalid sort or page', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?sort=bogus&page=0')
        await loaded()

        expect(traceUrls(fetchMock)).toEqual([
            '/trail/api/traces?range=24h&sort=-started_at&page=1',
        ])
        expect(header(/Started/)).toHaveAttribute('aria-sort', 'descending')
    })
})

describe('an invalid page in the URL', () => {
    it.each(['abc', '-3', '1.5', '0'])('%s is page 1', async (bad) => {
        const fetchMock = mockApi()
        renderApp(`/traces?page=${bad}`)
        await loaded()

        expect(lastTraceUrl(fetchMock)).toBe(
            '/trail/api/traces?range=24h&sort=-started_at&page=1',
        )
    })
})

describe('the view drives the URL', () => {
    it('sorts a column in its first direction, flips it, and returns to page 1', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?page=2')
        await loaded()

        await userEvent.click(sortButton(/Duration/))

        await expectSearch('?sort=-duration')
        await waitFor(() =>
            expect(lastTraceUrl(fetchMock)).toBe(
                '/trail/api/traces?range=24h&sort=-duration&page=1',
            ),
        )
        expect(header(/Duration/)).toHaveAttribute('aria-sort', 'descending')

        await userEvent.click(sortButton(/Duration/))

        await expectSearch('?sort=duration')
        expect(header(/Duration/)).toHaveAttribute('aria-sort', 'ascending')
    })

    it.each([
        [/Run/, '?sort=agent'],
        [/Est\. cost/, '?sort=-cost'],
        [/Started/, '?sort=started_at'],
    ])('sorts %s with the first click', async (name, expected) => {
        renderApp('/traces')
        await loaded()

        await userEvent.click(sortButton(name))

        await expectSearch(expected)
    })

    it('pages forward and keeps the sort', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?sort=-cost')
        await loaded()

        await userEvent.click(nextButton())

        await expectSearch('?sort=-cost&page=2')
        await waitFor(() =>
            expect(lastTraceUrl(fetchMock)).toBe(
                '/trail/api/traces?range=24h&sort=-cost&page=2',
            ),
        )
    })

    it('changes the range, returns to page 1 and keeps the sort, in one history entry', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?sort=-cost&page=3')
        await loaded()

        const entries = window.history.length

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(
            screen.getByRole('option', { name: 'Last 7 days' }),
        )

        await expectSearch('?sort=-cost&range=7d')
        expect(window.history.length).toBe(entries + 1)
        await waitFor(() =>
            expect(lastTraceUrl(fetchMock)).toBe(
                '/trail/api/traces?range=7d&sort=-cost&page=1',
            ),
        )
    })

    it('restores the previous sort and page with Back', async () => {
        renderApp('/traces')
        await loaded()

        await userEvent.click(sortButton(/Duration/))
        await userEvent.click(nextButton())

        await expectSearch('?sort=-duration&page=2')

        await travel('back')
        await expectSearch('?sort=-duration')
        await waitFor(() =>
            expect(header(/Duration/)).toHaveAttribute(
                'aria-sort',
                'descending',
            ),
        )

        await travel('back')
        await expectSearch('')
        await waitFor(() =>
            expect(header(/Started/)).toHaveAttribute(
                'aria-sort',
                'descending',
            ),
        )
    })
})

describe('the view after a change', () => {
    it('falls back to 24 hours for an unknown range', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?range=forever')
        await loaded()

        expect(lastTraceUrl(fetchMock)).toBe(
            '/trail/api/traces?range=24h&sort=-started_at&page=1',
        )
        expect(
            screen.getByRole('combobox', { name: 'Time range' }),
        ).toHaveTextContent('Last 24 hours')
    })

    it('marks the Run header when sorted by agent', async () => {
        renderApp('/traces?sort=agent')
        await loaded()

        expect(header(/Run/)).toHaveAttribute('aria-sort', 'ascending')

        await userEvent.click(sortButton(/Run/))

        await waitFor(() =>
            expect(header(/Run/)).toHaveAttribute('aria-sort', 'descending'),
        )
    })

    it('keeps focus on the sort button and on Next once the new rows arrive', async () => {
        const fetchMock = mockApi()
        renderApp('/traces')
        await loaded()

        await userEvent.click(sortButton(/Duration/))
        await waitFor(() =>
            expect(lastTraceUrl(fetchMock)).toContain('sort=-duration'),
        )
        expect(sortButton(/Duration/)).toHaveFocus()

        await userEvent.click(nextButton())
        await screen.findByText('Page 2 of 3')
        expect(nextButton()).toHaveFocus()
    })
})

describe('a page past the end', () => {
    it('lands on the real last page without adding a history entry', async () => {
        const fetchMock = mockApi()
        renderApp('/traces?page=99')

        const entries = window.history.length

        await expectSearch('?page=3')
        await screen.findByText('Page 3 of 3')
        expect(window.history.length).toBe(entries)
        expect(lastTraceUrl(fetchMock)).toBe(
            '/trail/api/traces?range=24h&sort=-started_at&page=3',
        )
        expect(dataRows()).toHaveLength(fixture.data.length)
    })

    it('does not show an empty table while it moves', async () => {
        mockApi((url) =>
            url.includes('page=99') ? json(listFor(url)) : never(),
        )
        renderApp('/traces?page=99')
        await appReady()

        expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
        expect(screen.queryByText('No runs found')).not.toBeInTheDocument()
    })
})

const skeletonTable = () => screen.getByRole('table', { name: 'Recorded runs' })
const skeletonRowCount = () =>
    skeletonTable().querySelectorAll('tbody tr').length
const pickRange = async (name: string) => {
    await userEvent.click(screen.getByRole('combobox', { name: 'Time range' }))
    await userEvent.click(screen.getByRole('option', { name }))
}

describe('while the runs load', () => {
    it('shows a table-shaped skeleton on the first load, with no count and no zero', async () => {
        mockApi(never)
        renderApp('/traces')
        await appReady()

        const table = skeletonTable()

        expect(table).toHaveAttribute('aria-busy', 'true')
        expect(
            within(
                screen
                    .getByRole('table')
                    .closest('[data-slot="data-table"]') as HTMLElement,
            ).getByRole('status'),
        ).toHaveTextContent('Loading')
        expect(within(table).getAllByRole('columnheader')).toHaveLength(7)
        expect(skeletonRowCount()).toBe(8)
        expect(
            [...table.querySelectorAll('tbody td')].map((c) => c.textContent),
        ).toEqual(Array(8 * 7).fill(''))
        expect(screen.queryByText(/\d traces$/)).not.toBeInTheDocument()
        expect(screen.queryByText('Loading runs…')).not.toBeInTheDocument()
    })

    it('replaces the skeleton with the rows', async () => {
        const first = deferred()
        mockApi(() => first.promise)
        renderApp('/traces')
        await appReady()

        expect(skeletonRowCount()).toBe(8)

        first.resolve(new Response(JSON.stringify(listFor('?page=1'))))
        await screen.findByText('Page 1 of 3')

        expect(skeletonTable()).not.toHaveAttribute('aria-busy')
        expect(dataRows()).toHaveLength(fixture.data.length)
    })

    it('keeps the rows on screen, marked busy, while the next page loads', async () => {
        const fetchMock = mockApi()
        renderApp('/traces')
        await loaded()

        const next = deferred()
        answerWith(fetchMock, () => next.promise)

        await userEvent.click(nextButton())

        await waitFor(() => expect(traceUrls(fetchMock)).toHaveLength(2))
        expect(dataRows()).toHaveLength(fixture.data.length)
        expect(screen.getByText('Loading')).toHaveAttribute('role', 'status')

        const region = screen.getByRole('table')

        expect(region).toHaveAttribute('aria-busy', 'true')
        expect(region.querySelector('tbody')).toHaveClass('opacity-60')
        // The footer still describes the rows on screen, not the URL that has moved on.
        expect(screen.getByText('Page 1 of 3')).toBeVisible()
        expect(screen.getByText('1–25 of 60 traces')).toBeVisible()

        next.resolve(
            new Response(JSON.stringify(listFor('/trail/api/traces?page=2'))),
        )

        await screen.findByText('Page 2 of 3')
        expect(screen.getByRole('table')).not.toHaveAttribute('aria-busy')
    })

    it('does not claim a new range is empty because the previous one was', async () => {
        const fetchMock = mockApi(() => json(emptyList))
        renderApp('/traces?range=1h')
        await screen.findByText('No runs found')

        answerWith(fetchMock, never)
        await pickRange('Last 24 hours')

        await waitFor(() =>
            expect(skeletonTable()).toHaveAttribute('aria-busy', 'true'),
        )
        expect(screen.queryByText('No runs found')).not.toBeInTheDocument()
    })
})

describe('when the runs cannot be loaded', () => {
    it('shows the API’s message and status, and no table', async () => {
        mockApi(() => json({ message: 'The database is down.' }, 500))
        renderApp('/traces')

        const alert = await screen.findByRole('alert')

        expect(alert).toHaveTextContent('The runs could not be loaded')
        expect(alert).toHaveTextContent('The database is down.')
        expect(alert).toHaveTextContent('Error 500')
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('keeps the error state and its button while a retry runs, and again after a second failure', async () => {
        const fetchMock = mockApi(() => json({ message: 'Down.' }, 500))
        renderApp('/traces')
        await screen.findByRole('alert')

        const retry = deferred()
        answerWith(fetchMock, () => retry.promise)

        const button = screen.getByRole('button', { name: 'Try again' })
        button.focus()
        await userEvent.click(button)

        await waitFor(() => expect(traceUrls(fetchMock)).toHaveLength(2))
        const busy = screen.getByRole('button', { name: 'Trying again…' })

        expect(busy).toBe(button)
        expect(busy).toHaveAttribute('aria-disabled', 'true')
        expect(busy).toHaveFocus()
        expect(screen.queryByRole('table')).not.toBeInTheDocument()

        // Pressing it meanwhile asks for nothing more.
        await userEvent.click(busy)
        expect(traceUrls(fetchMock)).toHaveLength(2)

        // It fails again: the error is updated, and focus is still on the button.
        retry.resolve(
            new Response(JSON.stringify({ message: 'Still down.' }), {
                status: 503,
            }),
        )
        expect(await screen.findByText('Still down.')).toBeVisible()
        expect(screen.getByText('Error 503')).toBeVisible()
        expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus()

        // And once more, this time it works.
        answerWith(fetchMock, (url) => json(listFor(url)))
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

        await screen.findByText('Page 1 of 3')
        expect(dataRows()).toHaveLength(fixture.data.length)
        expect(traceUrls(fetchMock)).toHaveLength(3)
        expect(
            screen.getByRole('heading', { level: 1, name: 'Traces' }),
        ).toHaveFocus()
    })

    it('does not carry a failure over to another view', async () => {
        const fetchMock = mockApi(() => json({ message: 'Down.' }, 500))
        renderApp('/traces')
        await screen.findByRole('alert')

        answerWith(fetchMock, never)
        await pickRange('Last 7 days')

        await waitFor(() =>
            expect(skeletonTable()).toHaveAttribute('aria-busy', 'true'),
        )
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('says the server could not be reached on a network failure, and recovers', async () => {
        const fetchMock = mockApi(() =>
            Promise.reject(new TypeError('Failed to fetch')),
        )
        renderApp('/traces')

        const alert = await screen.findByRole('alert')

        expect(alert).toHaveTextContent('The server could not be reached.')
        expect(alert).not.toHaveTextContent(/Error \d/)

        answerWith(fetchMock, (url) => json(listFor(url)))
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
        await screen.findByText('Page 1 of 3')

        expect(dataRows()).toHaveLength(fixture.data.length)
        expect(document.body).not.toHaveFocus()
    })

    it('does not leave another page’s rows up when the next page fails', async () => {
        const fetchMock = mockApi()
        renderApp('/traces')
        await loaded()

        answerWith(fetchMock, () => json({ message: 'No.' }, 500))

        await userEvent.click(nextButton())

        expect(await screen.findByRole('alert')).toHaveTextContent('No.')
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
})

describe('when the range holds no runs', () => {
    it('says so inside the table card, with the header and no pagination', async () => {
        mockApi(() => json(emptyList))
        renderApp('/traces')

        expect(await screen.findByText('No runs found')).toBeVisible()
        expect(
            screen.getByText('Runs appear here as your agents run.'),
        ).toBeVisible()
        expect(screen.queryByRole('button', { name: /show|range/i })).toBeNull()
        expect(
            screen
                .getByRole('table', { name: 'Recorded runs' })
                .closest('[data-slot="data-table"]'),
        ).toContainElement(screen.getByText('No runs found'))
        expect(dataRows()).toHaveLength(0)
        expect(
            screen.queryByRole('navigation', { name: 'Pagination' }),
        ).not.toBeInTheDocument()
    })

    it('leaves focus on the range select when the range is changed from it', async () => {
        const fetchMock = mockApi((url) =>
            url.includes('range=7d') ? json(listFor(url)) : json(emptyList),
        )
        renderApp('/traces')
        await screen.findByText('No runs found')

        await pickRange('Last 7 days')

        await screen.findByText('Page 1 of 3')
        expect(lastTraceUrl(fetchMock)).toContain('range=7d')
        expect(
            screen.getByRole('combobox', { name: 'Time range' }),
        ).toHaveFocus()
    })
})
