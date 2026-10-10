import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
    AttentionItem,
    AttentionKind,
    AttentionResponse,
    IssueKind,
} from '@/api/types'
import { forgetAttentionRefreshFailures } from '@/features/overview/use-attention'
import { forgetOverviewRefreshFailures } from '@/features/overview/use-overview'
import type { TimeRangePreset } from '@/lib/time-range'
import { maxFailedRefreshes, refreshEvery } from '@/lib/refresh-policy'
import { overviewKeys } from '@/api/overview'
import { renderApp, testQueryClient } from '@/test/render-app'
import { until } from '@/test/wait'
import {
    attentionFixture,
    attentionFor,
    attentionUrls,
    deferred,
    json,
    mockApi,
    overviewFixture,
    overviewFor,
    overviewUrls,
    overviewWith,
    paramsOf,
    runs,
} from '@/test/overview-api'

beforeEach(() => {
    forgetOverviewRefreshFailures()
    forgetAttentionRefreshFailures()
})

afterEach(() => {
    vi.useRealTimers()
})

const kinds: AttentionKind[] = [
    'failed',
    'incomplete',
    'awaiting_approval',
    'child_failed',
    'unpriced',
    'recovered',
]

/** The fixture's items, by kind. */
const item = (kind: AttentionKind): AttentionItem => {
    const found = attentionFixture.data.find((one) => one.kind === kind)

    if (found === undefined) {
        throw new Error(`The fixture has no ${kind} item.`)
    }

    return found
}

/** An answer whose `data` is `items`, for the range asked for. */
const answer =
    (items: AttentionItem[]) =>
    (url: string): Promise<Response> => {
        const base: AttentionResponse = attentionFor(url)

        return json({ ...base, data: items })
    }

/** The attention fixture answering for `preset` whatever range was asked for. */
const fixedRange = (preset: TimeRangePreset) => () =>
    json({
        ...attentionFixture,
        range: { ...attentionFixture.range, preset },
    })

/** The panel, found by its heading. */
async function panel(): Promise<HTMLElement> {
    const heading = await screen.findByRole('heading', {
        name: 'Needs attention',
        level: 2,
    })
    const found = heading.closest('[data-slot="panel"]')

    if (!(found instanceof HTMLElement)) {
        throw new Error('The panel is not on the page.')
    }

    return found
}

/** The panel once its list (or its empty answer) is in. */
async function open(route = '/', client = testQueryClient()) {
    renderApp(route, {}, client)
    const found = await panel()

    await waitFor(() =>
        expect(found.querySelector('[data-slot="panel-loading"]')).toBeNull(),
    )

    return found
}

const rowsOf = (of: HTMLElement) =>
    [...of.querySelectorAll('[data-slot="attention-cell"]')] as HTMLElement[]

const titleOf = (row: HTMLElement) =>
    row.querySelector('[data-slot="row-link"]')?.textContent

const detailOf = (row: HTMLElement) =>
    row.querySelector('[id]')?.firstElementChild?.textContent

/** The row of an item, by its title. */
const rowTitled = (of: HTMLElement, title: string): HTMLElement => {
    const found = rowsOf(of).find((row) => titleOf(row) === title)

    if (found === undefined) {
        throw new Error(`No row called ${title}.`)
    }

    return found
}

const hrefOf = (row: HTMLElement) =>
    row.querySelector('[data-slot="row-link"]')?.getAttribute('href')

/** The count in the header; the issue kinds under a row have chips of their own. */
const chip = (of: HTMLElement) =>
    of.querySelector('[data-slot="panel-header"] [data-slot="count-chip"]')

describe('the list', () => {
    it('has one row per item, in the order the API returns them, with the words of each kind', async () => {
        mockApi()
        const of = await open()

        expect(rowsOf(of).map((row) => [titleOf(row), detailOf(row)])).toEqual([
            ['Failed runs', '2 failed'],
            ['Incomplete runs', '2 stopped without finishing'],
            ['Awaiting approval', '1 waiting for a decision'],
            ['Sub-agent failed', '1 completed with a failed sub-agent'],
            ['Unpriced usage', '2 with steps that could not be priced'],
            ['Recovered by failover', '1 recovered after a provider failed'],
        ])
    })

    it('keeps the order of the answer, whatever it is', async () => {
        mockApi(
            undefined,
            undefined,
            answer([item('recovered'), item('failed')]),
        )
        const of = await open()

        expect(rowsOf(of).map(titleOf)).toEqual([
            'Recovered by failover',
            'Failed runs',
        ])
    })

    it.each([
        ['failed', 1, '1 failed'],
        ['failed', 12, '12 failed'],
        ['incomplete', 1, '1 stopped without finishing'],
        ['incomplete', 1284, '1,284 stopped without finishing'],
        ['awaiting_approval', 1, '1 waiting for a decision'],
        ['awaiting_approval', 3, '3 waiting for a decision'],
        ['child_failed', 1, '1 completed with a failed sub-agent'],
        ['child_failed', 3, '3 completed with a failed sub-agent'],
        ['unpriced', 1, '1 with steps that could not be priced'],
        ['unpriced', 3, '3 with steps that could not be priced'],
        ['recovered', 1, '1 recovered after a provider failed'],
        ['recovered', 3, '3 recovered after a provider failed'],
    ] as const)(
        'says exactly what the count of %s is, for %i',
        async (kind, count, words) => {
            mockApi(
                undefined,
                undefined,
                answer([{ ...item(kind), count, breakdown: [] }]),
            )
            const of = await open()

            expect(rowsOf(of).map(detailOf)).toEqual([words])
        },
    )

    it('has a row for every kind the API knows', () => {
        expect(attentionFixture.data.map((one) => one.kind)).toEqual(kinds)
    })

    it('names when the latest run began, in the application time zone', async () => {
        mockApi()
        const of = await open()
        const time = rowTitled(of, 'Failed runs').querySelector('time')

        expect(time).toHaveAttribute('datetime', '2026-01-02T10:20:00.000Z')
        // How long ago in words; the whole date and time are on hover and for assistive technology.
        expect(time).toHaveAttribute('title', 'Jan 2, 2026, 10:20:00 GMT')
        expect(time).toHaveTextContent('Jan 2, 2026, 10:20:00 GMT')
        expect(time?.querySelector('[aria-hidden="true"]')).toHaveTextContent(
            /\d+d ago$/,
        )
        expect(time?.closest('p')?.textContent).toMatch(
            /^2 failed · latest .+ ago/,
        )
    })

    it('draws no time for an item whose latest start could not be read', async () => {
        mockApi(
            undefined,
            undefined,
            answer([
                { ...item('incomplete'), latest_at: null },
                item('unpriced'),
            ]),
        )
        const of = await open()
        const [unread, read] = rowsOf(of)

        expect(unread?.querySelector('time')).toBeNull()
        expect(unread).not.toHaveTextContent(/latest/)
        expect(unread).toHaveTextContent('2 stopped without finishing')
        // The same row with a time does draw it.
        expect(read?.querySelector('time')).not.toBeNull()
        expect(read).toHaveTextContent(/ · latest /)
    })

    it('describes each link by its words, so the title alone is the link text', async () => {
        mockApi()
        const of = await open()
        const row = rowTitled(of, 'Incomplete runs')
        const link = within(row).getByRole('link', { name: 'Incomplete runs' })
        const detail = document.getElementById(
            link.getAttribute('aria-describedby') ?? '',
        )

        expect(detail).toHaveTextContent('2 stopped without finishing')
    })
})

describe('the links', () => {
    it('open the traces list over the item filters and the range, for every kind', async () => {
        // The list says 7d whatever the address asked for: the links follow the list.
        mockApi(undefined, undefined, fixedRange('7d'))
        const of = await open('/?range=1h')

        expect(
            Object.fromEntries(
                rowsOf(of).map((row) => [titleOf(row), hrefOf(row)]),
            ),
        ).toEqual({
            'Failed runs': '/trail/traces?range=7d&status=failed',
            'Incomplete runs': '/trail/traces?range=7d&status=incomplete',
            'Awaiting approval':
                '/trail/traces?range=7d&status=awaiting_approval',
            'Sub-agent failed':
                '/trail/traces?range=7d&status=completed&child_failed=1',
            'Unpriced usage': '/trail/traces?range=7d&unpriced=1',
            'Recovered by failover': '/trail/traces?range=7d&recovered=1',
        })
    })

    it('leave the default range out, as the list does', async () => {
        mockApi(undefined, undefined, fixedRange('24h'))
        const of = await open('/?range=7d')

        expect(hrefOf(rowTitled(of, 'Sub-agent failed'))).toBe(
            '/trail/traces?status=completed&child_failed=1',
        )
    })

    it('carry the range of the list on screen, not the one the address is ahead with', async () => {
        const next = deferred()
        // Asked for the last hour, the list answers for 24 hours: its links say 24 hours.
        mockApi(undefined, undefined, (url) =>
            paramsOf(url).range === '7d' ? next.promise : fixedRange('24h')(),
        )
        const of = await open('/?range=1h')

        expect(hrefOf(rowTitled(of, 'Failed runs'))).toBe(
            '/trail/traces?status=failed',
        )

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(
            screen.getByRole('option', { name: 'Last 7 days' }),
        )
        await waitFor(() => expect(window.location.search).toBe('?range=7d'))

        // The list on screen is still the one counted over 24 hours, and its links say so: not 1h, not 7d.
        expect(of.querySelector('[aria-busy="true"]')).not.toBeNull()
        expect(hrefOf(rowTitled(of, 'Failed runs'))).toBe(
            '/trail/traces?status=failed',
        )
        expect(
            [...of.querySelectorAll('a')].every(
                (link) => !link.getAttribute('href')?.includes('range='),
            ),
        ).toBe(true)

        next.resolve(
            await json(attentionFor('/api/overview/attention?range=7d')),
        )

        await waitFor(() =>
            expect(hrefOf(rowTitled(of, 'Failed runs'))).toBe(
                '/trail/traces?range=7d&status=failed',
            ),
        )
    })
})

describe('the issue kinds of failed runs', () => {
    it('are links of their own under the row, each with its count and the item filters', async () => {
        mockApi(undefined, undefined, fixedRange('7d'))
        const of = await open('/?range=1h')
        const list = within(rowTitled(of, 'Failed runs')).getByRole('list', {
            name: 'Failed runs by issue',
        })
        const links = within(list).getAllByRole('link')

        expect(
            links.map((link) => [link.textContent, link.getAttribute('href')]),
        ).toEqual([
            [
                'Rate limited1, 1 failed',
                '/trail/traces?range=7d&status=failed&issue_kind=rate_limited',
            ],
            [
                'Exception1, 1 failed',
                '/trail/traces?range=7d&status=failed&issue_kind=exception',
            ],
        ])
        expect(links.map((link) => link.parentElement?.tagName)).toEqual([
            'LI',
            'LI',
        ])
        // The name of each says what its number counts.
        expect(
            within(list).getByRole('link', { name: 'Rate limited, 1 failed' }),
        ).toBeVisible()
        // Safari drops the semantics of a list a reset styled: it says so itself.
        expect(list).toHaveAttribute('role', 'list')
    })

    it('are not drawn for the other kinds', async () => {
        mockApi()
        const of = await open()

        expect(
            within(rowTitled(of, 'Incomplete runs')).queryByRole('list'),
        ).toBeNull()
        expect(
            within(rowTitled(of, 'Failed runs')).getByRole('list'),
        ).toBeVisible()
    })

    it('add up to less than the count without a total or a remainder row', async () => {
        const failed = item('failed')

        mockApi(
            undefined,
            undefined,
            answer([
                {
                    ...failed,
                    count: 13,
                    breakdown: [
                        { ...failed.breakdown[0], count: 6 },
                        { ...failed.breakdown[1], count: 4 },
                    ],
                },
            ]),
        )
        const of = await open()
        const row = rowsOf(of)[0]

        expect(detailOf(row)).toBe('13 failed')
        expect(within(row).getAllByRole('link')).toHaveLength(3)
        // Two issue kinds, 6 and 4: no 10 for them together, no 3 for what is left over.
        expect(within(row).getByRole('list').textContent).toBe(
            'Rate limited6, 6 failedException4, 4 failed',
        )
    })

    it('are absent for failed runs that have no issue kind, which are only in the count', async () => {
        mockApi(
            undefined,
            undefined,
            answer([{ ...item('failed'), count: 4, breakdown: [] }]),
        )
        const of = await open()
        const row = rowsOf(of)[0]

        expect(detailOf(row)).toBe('4 failed')
        expect(within(row).queryByRole('list')).toBeNull()
        expect(within(row).getAllByRole('link')).toHaveLength(1)
    })
})

describe('the count in the header', () => {
    it('is the number of items', async () => {
        mockApi()
        const of = await open()

        expect(chip(of)).toHaveTextContent('6')
        expect(of.querySelector('[data-slot="panel-header"]')).toContainElement(
            chip(of) as HTMLElement,
        )
    })

    it('reads item when there is one', async () => {
        mockApi(undefined, undefined, answer([item('recovered')]))
        const of = await open()

        expect(chip(of)).toHaveTextContent('1')
        expect(
            of.querySelector('[data-slot="panel-header"]'),
        ).toHaveTextContent(/1\s*item$/)
    })

    it('is not drawn when nothing needs attention', async () => {
        mockApi(undefined, undefined, answer([]))
        const of = await open()

        expect(chip(of)).toBeNull()
    })

    it("is not the previous range's while the next loads", async () => {
        const next = deferred()
        mockApi(undefined, undefined, (url) =>
            paramsOf(url).range === '7d'
                ? next.promise
                : json(attentionFor(url)),
        )
        const of = await open()

        expect(chip(of)).not.toBeNull()

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(
            screen.getByRole('option', { name: 'Last 7 days' }),
        )
        await waitFor(() =>
            expect(of.querySelector('[aria-busy="true"]')).not.toBeNull(),
        )

        expect(chip(of)).toBeNull()

        next.resolve(await answer([item('failed')])('/x?range=7d'))

        await waitFor(() => expect(chip(of)).toHaveTextContent('1'))
    })
})

describe('nothing to look at', () => {
    it('is an answer: it says so and is no error', async () => {
        mockApi(undefined, undefined, answer([]))
        const of = await open()

        expect(
            within(of).getByText('Nothing needs attention in this range'),
        ).toBeVisible()
        expect(rowsOf(of)).toHaveLength(0)
        expect(screen.queryByRole('alert')).toBeNull()
    })

    it('is not said when something does', async () => {
        mockApi()
        const of = await open()

        expect(
            within(of).queryByText('Nothing needs attention in this range'),
        ).toBeNull()
    })

    it("does not say it of the next range from the previous range's empty list", async () => {
        const next = deferred()
        mockApi(undefined, undefined, (url) =>
            paramsOf(url).range === '7d' ? next.promise : answer([])(url),
        )
        const of = await open()

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(
            screen.getByRole('option', { name: 'Last 7 days' }),
        )
        await waitFor(() => expect(window.location.search).toBe('?range=7d'))

        expect(
            within(of).queryByText('Nothing needs attention in this range'),
        ).toBeNull()
        expect(of.querySelector('[data-slot="panel-loading"]')).not.toBeNull()

        next.resolve(await answer([item('failed')])('/x?range=7d'))

        await waitFor(() => expect(rowsOf(of)).toHaveLength(1))
    })
})

describe('while it loads', () => {
    it('draws a loading state, and no row, until the list is in', async () => {
        const pending = deferred()
        mockApi(undefined, undefined, () => pending.promise)
        renderApp('/')
        const of = await panel()

        expect(of.querySelector('[data-slot="panel-loading"]')).not.toBeNull()
        expect(chip(of)).toBeNull()
        expect(rowsOf(of)).toHaveLength(0)

        pending.resolve(await json(attentionFixture))

        await waitFor(() => expect(rowsOf(of)).toHaveLength(6))
        expect(of.querySelector('[data-slot="panel-loading"]')).toBeNull()
    })

    it("keeps the previous range's list dimmed and busy until the next arrives", async () => {
        const next = deferred()
        mockApi(undefined, undefined, (url) =>
            paramsOf(url).range === '7d'
                ? next.promise
                : json(attentionFor(url)),
        )
        const of = await open()

        expect(of.querySelector('[aria-busy="true"]')).toBeNull()

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(
            screen.getByRole('option', { name: 'Last 7 days' }),
        )
        await waitFor(() =>
            expect(of.querySelector('[aria-busy="true"]')).not.toBeNull(),
        )

        const dimmed = of.querySelector('[aria-busy="true"]') as HTMLElement
        const status = within(of).getByRole('status')

        expect(dimmed).toHaveClass('opacity-60')
        expect(rowsOf(of)).toHaveLength(6)
        expect(dimmed).toContainElement(rowsOf(of)[0])
        expect(status).toHaveTextContent('Loading what needs attention')
        expect(dimmed).not.toContainElement(status)

        next.resolve(
            await json(attentionFor('/api/overview/attention?range=7d')),
        )

        await waitFor(() =>
            expect(of.querySelector('[aria-busy="true"]')).toBeNull(),
        )
        expect(within(of).getByRole('status')).toBeEmptyDOMElement()
    })
})

describe('when it fails', () => {
    it('says so in its own panel, leaving the figures and the chart as they are, and tries again on request', async () => {
        let down = true
        mockApi(undefined, undefined, (url) =>
            down
                ? json({ message: 'Attention is down.' }, 500)
                : json(attentionFor(url)),
        )
        const of = await open()

        const alert = within(of).getByRole('alert')

        expect(alert).toHaveTextContent(
            'What needs attention could not be loaded',
        )
        expect(alert).toHaveTextContent(
            'The server answered with an error (500).',
        )
        expect(rowsOf(of)).toHaveLength(0)
        // Everything else on the page is where it was.
        expect(screen.getAllByRole('alert')).toHaveLength(1)
        expect(
            screen.getByRole('heading', { name: 'Trace activity' }),
        ).toBeVisible()
        expect(
            document.querySelector('[data-slot="metric-strip"]'),
        ).not.toBeNull()
        expect(screen.getByRole('button', { name: 'View data' })).toBeVisible()

        down = false
        await userEvent.click(
            within(alert).getByRole('button', { name: 'Try again' }),
        )

        await waitFor(() => expect(rowsOf(of)).toHaveLength(6))
        expect(within(of).queryByRole('alert')).toBeNull()
    })

    it('does not carry its failure into another range', async () => {
        mockApi(undefined, undefined, (url) =>
            paramsOf(url).range === '7d'
                ? json({ message: 'Seven days are down.' }, 500)
                : json(attentionFor(url)),
        )
        const of = await open()

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(
            screen.getByRole('option', { name: 'Last 7 days' }),
        )
        await within(of).findByRole('alert')

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(
            screen.getByRole('option', { name: 'Last 24 hours' }),
        )

        await waitFor(() => expect(rowsOf(of)).toHaveLength(6))
        expect(within(of).queryByRole('alert')).toBeNull()
    })
})

describe('refreshing', () => {
    const fakeInterval = () =>
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    async function tick(times = 1) {
        for (let i = 0; i < times; i++) {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(refreshEvery)
            })
        }
    }

    const nothingRunning = overviewWith({ runs: runs({ completed: 32 }) })

    it('asks again whenever the overview does, and when it stops so does the list', async () => {
        fakeInterval()
        let overview = overviewFixture
        const fetchMock = mockApi(() => json(overview))
        const of = await open()

        expect(attentionUrls(fetchMock)).toHaveLength(1)

        await tick()
        await until(() => expect(overviewUrls(fetchMock)).toHaveLength(2))
        await until(() => expect(attentionUrls(fetchMock)).toHaveLength(2))

        // The last answer of the overview, with nothing running any more: the list follows it once.
        overview = nothingRunning
        await tick()
        await until(() => expect(overviewUrls(fetchMock)).toHaveLength(3))
        await until(() => expect(attentionUrls(fetchMock)).toHaveLength(3))

        await tick(4)
        expect(overviewUrls(fetchMock)).toHaveLength(3)
        expect(attentionUrls(fetchMock)).toHaveLength(3)
        expect(rowsOf(of)).toHaveLength(6)
    })

    it('shows the new list when the refresh brings one', async () => {
        fakeInterval()
        let items = [item('failed')]
        mockApi(undefined, undefined, (url) => answer(items)(url))
        const of = await open()

        expect(rowsOf(of).map(titleOf)).toEqual(['Failed runs'])

        items = [item('failed'), item('incomplete')]
        await tick()

        await waitFor(() =>
            expect(rowsOf(of).map(titleOf)).toEqual([
                'Failed runs',
                'Incomplete runs',
            ]),
        )
    })

    it('never asks again by itself when nothing is running', async () => {
        fakeInterval()
        const fetchMock = mockApi(() => json(nothingRunning))
        await open()

        await tick(4)

        expect(attentionUrls(fetchMock)).toHaveLength(1)
    })

    it('keeps the list, says the refresh failed, and gives up after repeated failures', async () => {
        fakeInterval()
        let fail = false
        const client = testQueryClient()
        const key = overviewKeys.attention('24h')
        // A request is settled once it has been made and the query is idle again.
        const settled = (requests: number) => {
            expect(attentionUrls(fetchMock)).toHaveLength(requests)
            expect(client.getQueryState(key)?.fetchStatus).toBe('idle')
        }
        const fetchMock = mockApi(undefined, undefined, (url) =>
            fail ? json({ message: 'Down.' }, 500) : json(attentionFor(url)),
        )
        const of = await open('/', client)

        fail = true

        // One tick, one request, one settled failure: the next tick comes after it, as in a browser
        // where a request is quicker than two seconds.
        for (let failed = 1; failed <= maxFailedRefreshes; failed++) {
            await tick()
            await until(() => settled(1 + failed))
        }

        await within(of).findByText(
            'Refreshing stopped after repeated failures.',
        )
        // The list is still there, and so is its count.
        expect(rowsOf(of)).toHaveLength(6)
        expect(chip(of)).toHaveTextContent('6')

        const asked = attentionUrls(fetchMock).length

        expect(asked).toBe(1 + maxFailedRefreshes)

        // The overview answers again, and the list does not follow it any more.
        const updates = () =>
            client.getQueryState(overviewKeys.range('24h'))?.dataUpdateCount ??
            0
        const before = updates()

        await tick()
        await until(() => expect(updates()).toBeGreaterThan(before))
        await act(async () => {})
        expect(attentionUrls(fetchMock)).toHaveLength(asked)

        fail = false
        await userEvent.click(
            within(of).getByRole('button', { name: 'Try again' }),
        )

        await waitFor(() =>
            expect(within(of).queryByText(/Refreshing stopped/)).toBeNull(),
        )
        expect(within(of).queryByText(/refresh failed/)).toBeNull()
        expect(rowsOf(of)).toHaveLength(6)
    })

    it('says nothing about a failed refresh when the refresh worked', async () => {
        fakeInterval()
        mockApi()
        const of = await open()

        await tick(2)

        expect(of).not.toHaveTextContent(/refresh failed|Refreshing stopped/)
    })
})

describe('the overview it follows', () => {
    it('asks for the range of the page', async () => {
        // Nothing is running, so nothing asks again while the test looks.
        const fetchMock = mockApi((url) =>
            json({
                ...overviewFor(url),
                data: {
                    ...overviewFor(url).data,
                    summary: {
                        ...overviewFor(url).data.summary,
                        runs: runs({ completed: 32 }),
                    },
                },
            }),
        )
        await open('/?range=1h')

        expect(
            attentionUrls(fetchMock).map((url) => paramsOf(url).range),
        ).toEqual(['1h'])
    })
})

describe('an item that cannot be shown', () => {
    const good = () => item('incomplete')
    const failed = item('failed')

    const cases: [string, AttentionItem[], string][] = [
        [
            'a kind it has no words for',
            [
                {
                    ...item('unpriced'),
                    kind: 'mystery' as AttentionKind,
                    count: 7,
                },
                good(),
            ],
            'mystery',
        ],
        [
            'a filter the traces list does not keep in its address',
            [
                { ...item('recovered'), filters: { streamed: '1' }, count: 7 },
                good(),
            ],
            'recovered',
        ],
        [
            'a value the traces list does not read for its filter',
            [
                {
                    ...item('unpriced'),
                    filters: { unpriced: 'true' },
                    count: 7,
                },
                good(),
            ],
            'unpriced',
        ],
    ]

    it.each(cases)(
        'is drawn as a cell that says so, with its count and no link, for %s, and the rest stays',
        async (_name, items, shownKind) => {
            const report = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})

            mockApi(undefined, undefined, answer(items))
            const of = await open()
            const bad = of.querySelector(
                '[data-slot="attention-cell"][data-readable="false"]',
            ) as HTMLElement

            expect(bad).toHaveTextContent(shownKind)
            expect(bad).toHaveTextContent('7 · This item could not be shown.')
            expect(within(bad).queryByRole('link')).toBeNull()
            // The rest of the list, the strip and the chart are where they were.
            expect(
                within(of).getByRole('link', { name: 'Incomplete runs' }),
            ).toHaveAttribute('href', '/trail/traces?status=incomplete')
            expect(
                screen.getByRole('heading', { name: 'Trace activity' }),
            ).toBeVisible()
            expect(
                document.querySelector('[data-slot="metric-strip"]'),
            ).not.toBeNull()
            expect(screen.queryByRole('alert')).toBeNull()
            // Said once, for a developer.
            expect(
                report.mock.calls.filter(([text]) =>
                    String(text).includes('could not show every item'),
                ),
            ).toHaveLength(1)

            report.mockRestore()
        },
    )

    it('keeps the issue kinds it can read, and shows one it cannot as plain text, in a failed item', async () => {
        const report = vi.spyOn(console, 'error').mockImplementation(() => {})
        const rows = failed.breakdown

        mockApi(
            undefined,
            undefined,
            answer([
                {
                    ...failed,
                    breakdown: [
                        {
                            ...rows[0],
                            issue_kind: 'cosmic' as IssueKind,
                            count: 9,
                        },
                        rows[1],
                    ],
                },
                good(),
            ]),
        )
        const of = await open()
        const cell = rowTitled(of, 'Failed runs')
        const list = within(cell).getByRole('list')

        expect(
            within(list)
                .getAllByRole('link')
                .map((link) => link.getAttribute('href')),
        ).toEqual(['/trail/traces?status=failed&issue_kind=exception'])
        expect(list).toHaveTextContent('cosmic9')
        expect(
            within(cell).getByRole('link', { name: 'Failed runs' }),
        ).toBeVisible()
        expect(rowsOf(of)).toHaveLength(2)
        expect(report).toHaveBeenCalledTimes(1)

        report.mockRestore()
    })

    it('is not reported when everything can be shown', async () => {
        const report = vi.spyOn(console, 'error').mockImplementation(() => {})

        mockApi()
        await open()

        expect(report).not.toHaveBeenCalled()
        expect(document.querySelector('[data-readable="false"]')).toBeNull()

        report.mockRestore()
    })
})

describe('the compact cells', () => {
    it('are one list in a grid whose columns follow the width of the panel, not of the window', async () => {
        mockApi()
        const of = await open()
        const grid = of.querySelector('[data-slot="attention-grid"]')

        expect(grid).toHaveAttribute('role', 'list')
        expect(grid).toHaveClass('@2xl:grid-cols-2', '@4xl:grid-cols-3')
        expect(grid?.closest('[data-slot="panel-content"]')).toHaveClass(
            '@container',
        )
        expect(grid?.className).not.toMatch(/\b(sm|md|lg|xl):/)
        expect(rowsOf(of)).toHaveLength(6)
    })

    it('have the title and one line: the count wording and how long ago the latest run began', async () => {
        mockApi()
        const of = await open()
        const cell = rowTitled(of, 'Unpriced usage')

        expect(cell.querySelectorAll('p')).toHaveLength(1)
        expect(cell.querySelector('p')?.textContent).toMatch(
            /^2 with steps that could not be priced · latest .*ago/,
        )
    })

    it('say no date for a run that began seconds ago', async () => {
        const seconds = new Date(Date.now() - 12_000).toISOString()

        mockApi(
            undefined,
            undefined,
            answer([{ ...item('incomplete'), latest_at: seconds }]),
        )
        const of = await open()
        const time = rowsOf(of)[0]?.querySelector('time')

        expect(
            time?.querySelector('[aria-hidden="true"]')?.textContent,
        ).toMatch(/^\d+s ago$/)
    })

    it('keep fixed columns, so one item is one cell wide and the rest of the row is empty', async () => {
        mockApi(undefined, undefined, answer([item('recovered')]))
        const of = await open()
        const grid = of.querySelector('[data-slot="attention-grid"]')

        expect(rowsOf(of)).toHaveLength(1)
        expect(grid?.className).not.toMatch(/auto-fit|auto-fill/)
        expect(grid).toHaveClass('@4xl:grid-cols-3')
    })
})

describe('the list after the overview', () => {
    const fakeInterval = () =>
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    async function tick() {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(refreshEvery)
        })
    }

    it('takes the answer of its last trigger even when an earlier request is still in flight', async () => {
        fakeInterval()
        // Every response is held until the test settles it, so the order is the test's, not the machine's.
        const overviewAnswers = [deferred(), deferred()]
        const slow = deferred()
        let overviewAsked = 0
        let attentionAsked = 0

        const fetchMock = mockApi(
            () => {
                overviewAsked += 1

                return overviewAsked === 1
                    ? json(overviewFixture)
                    : (overviewAnswers[overviewAsked - 2]?.promise ??
                          json(overviewFixture))
            },
            undefined,
            (url) => {
                attentionAsked += 1

                if (attentionAsked === 1) {
                    return json(attentionFor(url))
                }

                // The request the second overview answer causes: slower than everything after it.
                return attentionAsked === 2
                    ? slow.promise
                    : answer([item('recovered')])(url)
            },
        )
        const of = await open()

        // The overview is asked again, and answers: the list asks, and its answer is held.
        await tick()
        await until(() => expect(overviewUrls(fetchMock)).toHaveLength(2))
        overviewAnswers[0]?.resolve(await json(overviewFixture))
        await until(() => expect(attentionUrls(fetchMock)).toHaveLength(2))

        // The overview's last answer, nothing running any more, comes while that request is in flight.
        await tick()
        await until(() => expect(overviewUrls(fetchMock)).toHaveLength(3))
        overviewAnswers[1]?.resolve(
            await json(overviewWith({ runs: runs({ completed: 32 }) })),
        )

        // The list asks once more, and what that answers is what it shows.
        await until(() => expect(attentionUrls(fetchMock)).toHaveLength(3))
        await waitFor(() =>
            expect(rowsOf(of).map(titleOf)).toEqual(['Recovered by failover']),
        )

        // The held request answers late with an older list. It was given up, so it is not shown.
        slow.resolve(await json(attentionFixture))
        await act(async () => {
            await Promise.resolve()
        })

        expect(rowsOf(of).map(titleOf)).toEqual(['Recovered by failover'])
        expect(attentionUrls(fetchMock)).toHaveLength(3)
    })

    it('gives a way to try again when the last refresh failed and nothing will ask by itself', async () => {
        let fail = false
        const client = testQueryClient()

        mockApi(
            () => json(overviewWith({ runs: runs({ completed: 32 }) })),
            undefined,
            (url) =>
                fail
                    ? json({ message: 'Down.' }, 500)
                    : json(attentionFor(url)),
        )
        renderApp('/', {}, client)
        const of = await panel()

        await waitFor(() => expect(rowsOf(of)).toHaveLength(6))

        fail = true
        await act(async () => {
            await client.refetchQueries({
                queryKey: overviewKeys.attention('24h'),
            })
        })

        await within(of).findByText(
            'The last refresh failed. What is shown is from before it.',
        )
        expect(rowsOf(of)).toHaveLength(6)

        fail = false
        await userEvent.click(
            within(of).getByRole('button', { name: 'Try again' }),
        )

        await waitFor(() =>
            expect(
                within(of).queryByText(/The last refresh failed/),
            ).toBeNull(),
        )
        expect(rowsOf(of)).toHaveLength(6)
    })

    it('offers no button while it is trying again by itself', async () => {
        fakeInterval()
        let fail = false

        mockApi(undefined, undefined, (url) =>
            fail ? json({ message: 'Down.' }, 500) : json(attentionFor(url)),
        )
        const of = await open()

        fail = true
        await tick()

        await within(of).findByText('The last refresh failed; trying again.')
        expect(
            within(of).queryByRole('button', { name: 'Try again' }),
        ).toBeNull()
    })
})
