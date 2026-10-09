import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetAttentionRefreshFailures } from '@/features/overview/use-attention'
import { forgetOverviewRefreshFailures } from '@/features/overview/use-overview'
import { renderApp } from '@/test/render-app'
import {
    deferred,
    expectSearch,
    json,
    mockApi,
    overviewFixture,
    overviewFor,
    overviewUrls,
    overviewWith,
    overviewWithSeries,
    paramsOf,
    runs,
    seriesBucket,
} from '@/test/overview-api'

beforeEach(() => {
    forgetOverviewRefreshFailures()
    forgetAttentionRefreshFailures()
})

afterEach(() => {
    vi.useRealTimers()
})

const panelHeading = () =>
    screen.findByRole('heading', { name: 'Trace activity', level: 2 })

/** The panel, found by its heading. */
async function panel(): Promise<HTMLElement> {
    const found = (await panelHeading()).closest('[data-slot="panel"]')

    if (!(found instanceof HTMLElement)) {
        throw new Error('The activity panel is not on the page.')
    }

    return found
}

/** The panel once its data is in. */
async function open(route = '/', overrides: Record<string, unknown> = {}) {
    renderApp(route, overrides)
    const found = await panel()

    await waitFor(() =>
        expect(found.querySelector('[data-slot="panel-loading"]')).toBeNull(),
    )

    return found
}

/** Opens the chart's table, which holds the numbers the drawing shows. */
async function showData(of: HTMLElement) {
    await userEvent.click(within(of).getByRole('button', { name: 'View data' }))

    return within(of).getByRole('table')
}

const header = (table: HTMLElement) =>
    within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent)

/** The rows of the table: the bucket's label, then its cells. */
const rows = (table: HTMLElement) =>
    within(table)
        .getAllByRole('row')
        .filter((row) => row.querySelector('td') !== null)
        .map((row) => [
            row.querySelector('th')?.textContent,
            ...[...row.querySelectorAll('td')].map((cell) => cell.textContent),
        ])

const rowAt = (table: HTMLElement, label: string) =>
    rows(table).find((row) => row[0]?.startsWith(label))

const addressParams = () =>
    Object.fromEntries(new URLSearchParams(window.location.search))

const legend = (of: HTMLElement) =>
    of.querySelector('.recharts-legend-wrapper') as HTMLElement

describe('the volume view', () => {
    it('stacks failed, incomplete and the rest, each from its own field of the bucket', async () => {
        mockApi()
        const of = await open()
        const table = await showData(of)

        expect(header(table)).toEqual([
            'Time',
            'Failed',
            'Incomplete',
            'Completed or in flight',
        ])
        expect(legend(of).textContent).toBe(
            'FailedIncompleteCompleted or in flight',
        )
        // 6 runs: 3 completed, 1 failed, 1 incomplete, 1 awaiting approval.
        expect(rowAt(table, 'Jan 2, 10:00–11:00')).toEqual([
            'Jan 2, 10:00–11:00',
            '1',
            '1',
            '4',
        ])
        // 2 runs: 1 incomplete (stopped, not failed) and 1 still running.
        expect(rowAt(table, 'Jan 2, 05:00–06:00')).toEqual([
            'Jan 2, 05:00–06:00',
            '0',
            '1',
            '1',
        ])
    })

    it('counts as the rest every run that is neither failed nor incomplete', async () => {
        mockApi(() =>
            json(
                overviewWithSeries([
                    seriesBucket(
                        '2026-01-02T10:00:00.000Z',
                        '2026-01-02T11:00:00.000Z',
                        {
                            runs: runs({
                                completed: 3,
                                running: 2,
                                awaiting_approval: 1,
                                failed: 1,
                                incomplete: 2,
                            }),
                        },
                    ),
                ]),
            ),
        )
        const table = await showData(await open())

        expect(rows(table)).toEqual([['10:00–11:00', '1', '2', '6']])
    })

    it('says in words what the rest covers, and never calls incomplete runs failed', async () => {
        mockApi()
        const of = await open()
        const summary = within(of).getByRole('img').getAttribute('aria-label')

        expect(summary).toContain('32 traces started in this range')
        expect(summary).toContain('1 failed and 2 incomplete')
        expect(summary).toContain(
            'Failed, Incomplete and Completed or in flight',
        )
        expect(summary).toContain(
            'covers completed, running and awaiting-approval traces',
        )
        expect(summary).not.toMatch(/latency|p95/i)
    })

    it('shows a range with no runs as zero in every bucket, not as missing', async () => {
        mockApi(() =>
            json(
                overviewWithSeries(
                    overviewFixture.data.series.buckets.map((one) =>
                        seriesBucket(one.from, one.to, {
                            full: one.full,
                            in_progress: one.in_progress,
                        }),
                    ),
                    'hour',
                    '24h',
                    { runs: runs({}) },
                ),
            ),
        )
        const of = await open()

        expect(within(of).getByText('No runs in this range')).toBeVisible()
        const table = await showData(of)

        expect(
            rows(table).every((row) => row.slice(1).join() === '0,0,0'),
        ).toBe(true)
        expect(within(table).queryByText('No count')).toBeNull()
    })

    it('does not say a range has no runs when it has', async () => {
        mockApi()
        const of = await open()

        expect(within(of).queryByText('No runs in this range')).toBeNull()
    })
})

describe('the duration view', () => {
    it('draws the average duration, labelled so and never as latency or a percentile', async () => {
        mockApi()
        const of = await open('/?chart=duration')
        const table = await showData(of)

        expect(header(table)).toEqual(['Time', 'Avg duration'])
        expect(legend(of).textContent).toBe('Avg duration')
        expect(of.textContent).not.toMatch(/latency|p95/i)
        expect(rowAt(table, 'Jan 2, 10:00–11:00')?.[1]).toBe('491 ms')
        expect(rowAt(table, 'Jan 2, 11:00–12:00')?.[1]).toBe('1.84s')
    })

    it('leaves a bucket where nothing was measured as not captured, never as zero', async () => {
        mockApi()
        const table = await showData(await open('/?chart=duration'))

        // Two runs, none of them measured: the average is absent, not 0 ms.
        expect(rowAt(table, 'Jan 2, 05:00–06:00')?.[1]).toBe('No measured runs')
        expect(
            rows(table).filter((row) => row[1] === 'No measured runs'),
        ).toHaveLength(21)
        expect(within(table).queryByText(/^(0 ms|<1 ms)$/)).toBeNull()
    })

    it('says no duration was captured when no bucket has one, and no runs when there are none', async () => {
        const buckets = overviewFixture.data.series.buckets.map((one) =>
            seriesBucket(one.from, one.to, {
                runs: one.runs,
                full: one.full,
            }),
        )
        mockApi(() => json(overviewWithSeries(buckets)))
        const of = await open('/?chart=duration')

        expect(
            within(of).getByText('No duration was captured in this range'),
        ).toBeVisible()
        expect(
            within(of).queryByRole('button', { name: 'View data' }),
        ).toBeNull()
    })

    it('says no runs, not that nothing was captured, for a range without runs', async () => {
        mockApi(() =>
            json(
                overviewWithSeries(
                    overviewFixture.data.series.buckets.map((one) =>
                        seriesBucket(one.from, one.to),
                    ),
                    'hour',
                    '24h',
                    { runs: runs({}) },
                ),
            ),
        )
        const of = await open('/?chart=duration')

        expect(within(of).getByText('No runs in this range')).toBeVisible()
        expect(within(of).queryByText(/No duration was captured/)).toBeNull()
    })
})

describe('the cost view', () => {
    it('draws the amount of each bucket as the cost formatter writes it', async () => {
        mockApi()
        const of = await open('/?chart=cost')
        const table = await showData(of)

        expect(header(table)).toEqual(['Time', 'Estimated cost'])
        expect(legend(of).textContent).toBe('Estimated cost')
        expect(rowAt(table, 'Jan 2, 08:00–09:00')?.[1]).toBe('$0.0200')
        expect(rowAt(table, 'Jan 2, 09:00–10:00')?.[1]).toBe('<$0.0001')
    })

    it('leaves a bucket with no amount as not captured, never as $0', async () => {
        mockApi(() =>
            json(
                overviewWithSeries([
                    seriesBucket(
                        '2026-01-02T09:00:00.000Z',
                        '2026-01-02T10:00:00.000Z',
                        {
                            runs: runs({ completed: 2 }),
                            cost: { state: 'unpriced', amount: null },
                            unpriced_runs: 2,
                        },
                    ),
                    seriesBucket(
                        '2026-01-02T10:00:00.000Z',
                        '2026-01-02T11:00:00.000Z',
                        {
                            runs: runs({ completed: 1 }),
                            cost: { state: 'estimated', amount: 12.5 },
                        },
                    ),
                ]),
            ),
        )
        const table = await showData(await open('/?chart=cost'))

        expect(rows(table)).toEqual([
            ['09:00–10:00', 'No amount'],
            ['10:00–11:00', '$12.50'],
        ])
    })

    it('says how many buckets are partly priced and how many are pending, since those amounts are not final', async () => {
        mockApi()
        const of = await open('/?chart=cost')

        // Fixture: one bucket partly priced; two (one without an amount yet) still pending.
        expect(
            within(of).getByText(
                'Amounts are not final: 1 interval is partly priced and 2 intervals are still pending.',
            ),
        ).toBeVisible()
    })

    it('names only what applies', async () => {
        const final = (state: 'partial' | 'estimated') =>
            overviewWithSeries([
                seriesBucket(
                    '2026-01-02T10:00:00.000Z',
                    '2026-01-02T11:00:00.000Z',
                    {
                        runs: runs({ completed: 1 }),
                        cost: { state, amount: 1 },
                    },
                ),
            ])
        mockApi(() => json(final('partial')))
        const of = await open('/?chart=cost')

        expect(
            within(of).getByText(
                'Amounts are not final: 1 interval is partly priced.',
            ),
        ).toBeVisible()
    })

    it('has no such line when every priced bucket is final', async () => {
        mockApi(() =>
            json(
                overviewWithSeries([
                    seriesBucket(
                        '2026-01-02T10:00:00.000Z',
                        '2026-01-02T11:00:00.000Z',
                        {
                            runs: runs({ completed: 1 }),
                            cost: { state: 'estimated', amount: 1 },
                        },
                    ),
                ]),
            ),
        )
        const of = await open('/?chart=cost')

        expect(
            within(of).getByRole('button', { name: 'View data' }),
        ).toBeVisible()
        expect(within(of).queryByText(/Amounts are not final/)).toBeNull()
    })

    it('keeps the line out of the other views', async () => {
        mockApi()
        const of = await open()

        expect(within(of).queryByText(/Amounts are not final/)).toBeNull()
    })

    it('says no cost could be priced when no bucket has an amount', async () => {
        mockApi(() =>
            json(
                overviewWithSeries(
                    overviewFixture.data.series.buckets.map((one) =>
                        seriesBucket(one.from, one.to, {
                            runs: one.runs,
                            cost: { state: 'unpriced', amount: null },
                        }),
                    ),
                ),
            ),
        )
        const of = await open('/?chart=cost')

        expect(
            within(of).getByText('No cost could be priced in this range'),
        ).toBeVisible()
        expect(within(of).queryByText(/Amounts are not final/)).toBeNull()
    })
})

describe('the words for a value that is missing', () => {
    it('name no cause in Cost, where unpriced, pending and unreported buckets all have no amount', async () => {
        mockApi(() =>
            json(
                overviewWithSeries([
                    seriesBucket(
                        '2026-01-02T08:00:00.000Z',
                        '2026-01-02T09:00:00.000Z',
                        {
                            runs: runs({ completed: 1 }),
                            cost: { state: 'unpriced', amount: null },
                        },
                    ),
                    seriesBucket(
                        '2026-01-02T09:00:00.000Z',
                        '2026-01-02T10:00:00.000Z',
                        {
                            runs: runs({ running: 1 }),
                            cost: { state: 'pending', amount: null },
                        },
                    ),
                    seriesBucket(
                        '2026-01-02T10:00:00.000Z',
                        '2026-01-02T11:00:00.000Z',
                        {
                            runs: runs({ completed: 1 }),
                            cost: { state: 'not_captured', amount: null },
                        },
                    ),
                    seriesBucket(
                        '2026-01-02T11:00:00.000Z',
                        '2026-01-02T12:00:00.000Z',
                        {
                            runs: runs({ completed: 1 }),
                            cost: { state: 'estimated', amount: 2 },
                        },
                    ),
                ]),
            ),
        )
        const of = await open('/?chart=cost')
        const table = await showData(of)

        expect(rows(table).map((row) => row[1])).toEqual([
            'No amount',
            'No amount',
            'No amount',
            '$2.00',
        ])
        expect(table.textContent).not.toMatch(/Unpriced|Pending|Not captured/)
        expect(
            within(of).getByText(
                'Amounts are not final: 1 interval is still pending. 1 interval has no amount because its usage could not be priced.',
            ),
        ).toBeVisible()
    })

    it('say how many are unpriced beside how many are partly priced and pending', async () => {
        mockApi()
        const of = await open('/?chart=cost')

        expect(of.querySelector('[data-slot="cost-caveat"]')).toHaveTextContent(
            'Amounts are not final: 1 interval is partly priced and 2 intervals are still pending.',
        )
        expect(
            of.querySelector('[data-slot="cost-caveat"]'),
        ).not.toHaveTextContent(/no amount because/)
    })

    it('name no cause in Duration, where a bucket of running runs has none either', async () => {
        mockApi(() =>
            json(
                overviewWithSeries([
                    seriesBucket(
                        '2026-01-02T10:00:00.000Z',
                        '2026-01-02T11:00:00.000Z',
                        { runs: runs({ running: 2 }) },
                    ),
                    seriesBucket(
                        '2026-01-02T11:00:00.000Z',
                        '2026-01-02T12:00:00.000Z',
                        {
                            runs: runs({ completed: 1 }),
                            duration: { average_ms: 250, measured: 1 },
                        },
                    ),
                ]),
            ),
        )
        const table = await showData(await open('/?chart=duration'))

        expect(rows(table).map((row) => row[1])).toEqual([
            'No measured runs',
            '250 ms',
        ])
    })
})

describe('an empty series', () => {
    const noBuckets = (all: number) =>
        mockApi(() =>
            json(
                overviewWithSeries([], 'hour', '24h', {
                    runs: runs({ completed: all }),
                }),
            ),
        )

    it('claims nothing when the summary has runs but there is no bucket to draw', async () => {
        noBuckets(5)
        const of = await open()

        expect(within(of).getByText('No activity to draw')).toBeVisible()
        expect(within(of).queryByText('No runs in this range')).toBeNull()
    })

    it('says no runs when the summary has none', async () => {
        noBuckets(0)
        const of = await open()

        expect(within(of).getByText('No runs in this range')).toBeVisible()
        expect(within(of).queryByText('No activity to draw')).toBeNull()
    })
})

describe('the switch while the data arrives', () => {
    it('is the same element, still focused, when the data resolves', async () => {
        const pending = deferred()
        mockApi(() => pending.promise)
        renderApp('/')
        const of = await panel()
        const choice = within(of).getByRole('radio', { name: 'Duration' })

        act(() => choice.focus())
        expect(choice).toHaveFocus()

        pending.resolve(await json(overviewFor('/api/overview?range=24h')))
        await within(of).findByRole('button', { name: 'View data' })

        expect(choice.isConnected).toBe(true)
        expect(choice).toHaveFocus()
        expect(within(of).getByRole('radio', { name: 'Duration' })).toBe(choice)
    })
})

describe('the in-progress bucket', () => {
    it('is named in the table and above the chart', async () => {
        mockApi()
        const of = await open()
        const table = await showData(of)

        expect(rowAt(table, 'Jan 2, 12:00–12:20')?.[0]).toBe(
            'Jan 2, 12:00–12:20 (In progress)',
        )
        expect(
            rows(table).filter((row) => row[0]?.includes('(In progress)')),
        ).toHaveLength(1)
        expect(
            of.querySelector('[data-slot="time-series-chart-in-progress"]'),
        ).toHaveTextContent('In progress: Jan 2, 12:00–12:20')
    })

    it('is not named when the API says no bucket is filling', async () => {
        mockApi(() =>
            json(
                overviewWithSeries(
                    overviewFixture.data.series.buckets.map((one) => ({
                        ...one,
                        in_progress: false,
                    })),
                ),
            ),
        )
        const of = await open()
        await showData(of)

        expect(of.textContent).not.toContain('In progress')
    })
})

describe('the choice of view', () => {
    it('is on the address, with volume left out of it', async () => {
        mockApi()
        const of = await open()

        expect(within(of).getByRole('radio', { name: 'Volume' })).toBeChecked()

        await userEvent.click(within(of).getByRole('radio', { name: 'Cost' }))
        await expectSearch('?chart=cost')
        expect(within(of).getByRole('radio', { name: 'Cost' })).toBeChecked()

        await userEvent.click(
            within(of).getByRole('radio', { name: 'Duration' }),
        )
        await expectSearch('?chart=duration')

        await userEvent.click(within(of).getByRole('radio', { name: 'Volume' }))
        await expectSearch('')
        expect(within(of).getByRole('radio', { name: 'Volume' })).toBeChecked()
    })

    it('is named for what it does, and keeps one view on when the current one is pressed again', async () => {
        mockApi()
        const of = await open('/?chart=duration')

        expect(
            within(of).getByRole('radiogroup', { name: 'Chart shows' }),
        ).toBeVisible()

        await userEvent.click(
            within(of).getByRole('radio', { name: 'Duration' }),
        )

        expect(
            within(of).getByRole('radio', { name: 'Duration' }),
        ).toBeChecked()
        expect(window.location.search).toBe('?chart=duration')
    })

    it('is read from the address when the page opens', async () => {
        mockApi()
        const of = await open('/?chart=cost')

        expect(within(of).getByRole('radio', { name: 'Cost' })).toBeChecked()
        expect(
            within(of).getByText(
                'Estimated cost of the traces started per hour',
            ),
        ).toBeVisible()
    })

    it('falls back to volume for a view it does not know', async () => {
        mockApi()
        const of = await open('/?chart=latency')

        expect(within(of).getByRole('radio', { name: 'Volume' })).toBeChecked()
    })

    it('survives a change of range, and the range survives a change of view', async () => {
        mockApi()
        const of = await open('/?chart=duration')

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(
            screen.getByRole('option', { name: 'Last 7 days' }),
        )
        await waitFor(() =>
            expect(addressParams()).toEqual({ range: '7d', chart: 'duration' }),
        )
        expect(
            within(of).getByRole('radio', { name: 'Duration' }),
        ).toBeChecked()

        await userEvent.click(within(of).getByRole('radio', { name: 'Cost' }))
        await waitFor(() =>
            expect(addressParams()).toEqual({ range: '7d', chart: 'cost' }),
        )
    })

    it('keeps the table open when the view changes', async () => {
        mockApi()
        const of = await open()
        const table = await showData(of)

        await userEvent.click(
            within(of).getByRole('radio', { name: 'Duration' }),
        )

        expect(header(table)).toEqual(['Time', 'Avg duration'])
    })
})

describe('the words for the buckets', () => {
    it('follow the application time zone, and say which', async () => {
        mockApi()
        // 10:00 UTC is 13:00 in Istanbul.
        const of = await open('/', { timezone: 'Europe/Istanbul' })
        const table = await showData(of)

        // The bucket that began at 10:00 UTC, with its 1 failed, 1 incomplete and 4 others.
        expect(rowAt(table, 'Jan 2, 13:00–14:00')).toEqual([
            'Jan 2, 13:00–14:00',
            '1',
            '1',
            '4',
        ])
        expect(
            within(of).getByText(
                'Buckets follow the application’s time zone (Europe/Istanbul).',
            ),
        ).toBeVisible()
    })

    it('say so without a name when the application did not give a usable one', async () => {
        mockApi()
        const of = await open('/', { timezone: 'Not/AZone' })

        expect(
            within(of).getByText('Buckets are shown in your local time zone.'),
        ).toBeVisible()
        expect(of.textContent).not.toMatch(/application’s time zone/)
    })

    it('say the zone they follow only when it is one the labels are written in', async () => {
        mockApi()
        const of = await open('/', { timezone: 'Asia/Tokyo' })

        expect(
            within(of).getByText(
                'Buckets follow the application’s time zone (Asia/Tokyo).',
            ),
        ).toBeVisible()
        expect(of.textContent).not.toMatch(/local time zone/)
    })

    it('are the day for day buckets, and the span of a day the range cut', async () => {
        mockApi(() =>
            json(
                overviewWithSeries(
                    [
                        seriesBucket(
                            '2026-01-01T12:20:00.000Z',
                            '2026-01-02T00:00:00.000Z',
                            { full: false, runs: runs({ completed: 1 }) },
                        ),
                        seriesBucket(
                            '2026-01-02T00:00:00.000Z',
                            '2026-01-03T00:00:00.000Z',
                            { runs: runs({ completed: 2 }) },
                        ),
                    ],
                    'day',
                    '7d',
                ),
            ),
        )
        const of = await open('/?range=7d')
        const table = await showData(of)

        expect(rows(table).map((row) => row[0])).toEqual([
            'Jan 1, 12:20–00:00',
            'Jan 2',
        ])
        expect(
            within(of).getByText(/Traces started per day, by outcome/),
        ).toBeVisible()
    })

    it('are 5-minute spans for the last hour', async () => {
        mockApi(() =>
            json(
                overviewWithSeries(
                    [
                        seriesBucket(
                            '2026-01-02T11:20:00.000Z',
                            '2026-01-02T11:25:00.000Z',
                        ),
                        seriesBucket(
                            '2026-01-02T11:25:00.000Z',
                            '2026-01-02T11:30:00.000Z',
                            { runs: runs({ completed: 1 }) },
                        ),
                    ],
                    '5m',
                    '1h',
                ),
            ),
        )
        const of = await open('/?range=1h')
        const table = await showData(of)

        expect(rows(table).map((row) => row[0])).toEqual([
            '11:20–11:25',
            '11:25–11:30',
        ])
        expect(
            within(of).getByText(/Traces started per 5 minutes, by outcome/),
        ).toBeVisible()
    })
})

describe('asking for data', () => {
    it('reads the overview the strip reads and makes no request of its own', async () => {
        // Nothing is running, so nothing is asked again by the clock while the test counts.
        const fetchMock = mockApi(() =>
            json(overviewWith({ runs: runs({ completed: 32 }) })),
        )
        const of = await open()
        await showData(of)
        await screen.findAllByText('vs previous 24 hours')

        // Every request the page made: the chart added none of its own.
        const kinds = fetchMock.mock.calls.map(([url]) =>
            url.includes('/api/overview/attention')
                ? 'attention'
                : url.includes('/api/overview')
                  ? 'overview'
                  : url.includes('/api/meta')
                    ? 'meta'
                    : url.includes('/api/agents')
                      ? 'agents'
                      : url,
        )

        expect(overviewUrls(fetchMock)).toHaveLength(1)
        expect(kinds.filter((kind) => kind === 'overview')).toHaveLength(1)
        expect(kinds.filter((kind) => kind === 'attention')).toHaveLength(1)
        expect(kinds.filter((kind) => kind === 'agents')).toHaveLength(1)
        expect(
            kinds.filter(
                (kind) =>
                    !['overview', 'attention', 'agents', 'meta'].includes(kind),
            ),
        ).toEqual([])
    })
})

describe('the states', () => {
    it('draws a loading state, with the choice of view in reach, while the overview loads', async () => {
        const pending = deferred()
        mockApi(() => pending.promise)
        renderApp('/')
        const of = (
            await screen.findByRole('heading', { name: 'Trace activity' })
        ).closest('[data-slot="panel"]') as HTMLElement

        expect(of.querySelector('[data-slot="panel-loading"]')).not.toBeNull()
        expect(within(of).getByRole('radio', { name: 'Volume' })).toBeVisible()
        expect(
            within(of).queryByRole('button', { name: 'View data' }),
        ).toBeNull()

        pending.resolve(await json(overviewFor('/api/overview?range=24h')))

        await within(of).findByRole('button', { name: 'View data' })
        expect(of.querySelector('[data-slot="panel-loading"]')).toBeNull()
    })

    it('is not drawn when the overview failed, since the page says so once already', async () => {
        mockApi(() => json({ message: 'Overview is down.' }, 500))
        renderApp('/')

        await screen.findByText('The overview could not be loaded')

        expect(
            screen.queryByRole('heading', { name: 'Trace activity' }),
        ).toBeNull()
        expect(screen.getAllByRole('alert')).toHaveLength(1)
    })

    it('keeps the previous range dimmed, with its own labels, until the next arrives', async () => {
        const next = deferred()
        mockApi((url) =>
            paramsOf(url).range === '7d'
                ? next.promise
                : json(overviewFor(url)),
        )
        const of = await open()
        await showData(of)

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(
            screen.getByRole('option', { name: 'Last 7 days' }),
        )
        await expectSearch('?range=7d')

        const content = of.querySelector('[aria-busy="true"]') as HTMLElement

        expect(content).toHaveClass('opacity-60')
        expect(content).toHaveTextContent('Jan 2, 10:00–11:00')
        expect(within(of).getByText(/Traces started per hour/)).toBeVisible()
        // The announcement is outside the busy part, where a screen reader may mute it.
        const status = within(of).getByRole('status')

        expect(status).toHaveTextContent('Loading the activity chart')
        expect(content).not.toContainElement(status)

        next.resolve(
            await json(
                overviewWithSeries(
                    [
                        seriesBucket(
                            '2026-01-01T21:00:00.000Z',
                            '2026-01-02T21:00:00.000Z',
                            { runs: runs({ completed: 7 }) },
                        ),
                    ],
                    'day',
                    '7d',
                ),
            ),
        )

        await waitFor(() =>
            expect(of.querySelector('[aria-busy="true"]')).toBeNull(),
        )
        expect(within(of).getByText(/Traces started per day/)).toBeVisible()
        expect(
            rows(within(of).getByRole('table')).map((row) => row[0]),
        ).toEqual(['Jan 1'])
        expect(within(of).getByRole('status')).toBeEmptyDOMElement()
    })
})
