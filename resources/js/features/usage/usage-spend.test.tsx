import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type {
    ProjectionLeftOut,
    SpendBucket,
    SpendProjection,
    UsageSpendResponse,
} from '@/api/types'
import { forgetUsageRefreshFailures } from '@/features/usage/use-usage'
import { forgetUsageBreakdownRefreshFailures } from '@/features/usage/use-usage-breakdown'
import { forgetUsageSpendRefreshFailures } from '@/features/usage/use-usage-spend'
import { formatCost } from '@/lib/format'
import { renderApp } from '@/test/render-app'
import {
    deferred,
    json,
    mockQuietApi,
    spendFixture,
    spendFor,
    spendUrls,
    spendWith,
} from '@/test/usage-api'

beforeEach(() => {
    forgetUsageRefreshFailures()
    forgetUsageBreakdownRefreshFailures()
    forgetUsageSpendRefreshFailures()
})

const { series, projection } = spendFixture.data

if (projection.state !== 'projected') {
    throw new Error('The fixture is projected.')
}

const never = () => new Promise<Response>(() => {})

const panel = () => {
    const found = screen
        .getByRole('heading', { level: 2, name: 'Estimated cost over time' })
        .closest('[data-slot="panel"]')

    if (!(found instanceof HTMLElement)) {
        throw new Error('No panel.')
    }

    return found
}

const figures = () => {
    const found = panel().querySelector('[data-slot="spend-figures"]')

    if (!(found instanceof HTMLElement)) {
        throw new Error('No figures.')
    }

    return found
}

/** The chart is in: the panel has its figures. */
const loaded = () =>
    waitFor(() =>
        expect(
            panel().querySelector('[data-slot="spend-figures"]'),
        ).not.toBeNull(),
    )

async function open(
    route = '/usage',
    spend:
        UsageSpendResponse | ((url: string) => UsageSpendResponse) = spendFor,
) {
    const fetchMock = mockQuietApi(undefined, (url) =>
        json(typeof spend === 'function' ? spend(url) : spend),
    )

    renderApp(route)
    await loaded()

    return fetchMock
}

const noLeftOut: ProjectionLeftOut = {
    unpriced_steps: 0,
    unpriced_tokens: 0,
    unfinished_runs: 0,
}

const withoutProjection = (
    state: 'not_enough_history' | 'range_not_current',
    window: { buckets: number; with_usage: number } | null = null,
    leftOut: ProjectionLeftOut = noLeftOut,
): SpendProjection =>
    state === 'range_not_current'
        ? {
              state,
              window: null,
              per_bucket: null,
              total: null,
              buckets: [],
              left_out: leftOut,
          }
        : {
              state,
              window:
                  window === null
                      ? null
                      : {
                            from: '2026-01-02T06:00:00.000Z',
                            to: '2026-01-02T12:00:00.000Z',
                            ...window,
                        },
              per_bucket: null,
              total: null,
              buckets: [],
              left_out: leftOut,
          }

/** The series with every bucket's cost and cumulative replaced. */
const allBuckets = (cost: SpendBucket['cost']): SpendBucket[] =>
    series.buckets.map((bucket) => ({ ...bucket, cost, cumulative: cost }))

const sentenceOf = () =>
    panel().querySelector('[data-slot="spend-assumption"]')?.textContent

const legend = () =>
    panel().querySelector('.recharts-legend-wrapper')?.textContent

const curves = () => [...panel().querySelectorAll('path.recharts-line-curve')]

describe('the estimated cost panel', () => {
    it('asks for the page’s range and sits between the totals and the breakdown', async () => {
        const fetchMock = await open()

        expect(spendUrls(fetchMock)).toEqual([
            '/trail/api/usage/spend?range=24h',
        ])
        expect(
            within(panel()).getByText('Cumulative US dollars · estimates'),
        ).toBeVisible()

        const order = [
            screen.getByText('Pricing coverage'),
            panel(),
            screen.getByRole('heading', { level: 2, name: 'Usage breakdown' }),
        ]

        expect(
            order.map((element, index) =>
                index === 0
                    ? 0
                    : order[index - 1].compareDocumentPosition(element) &
                      Node.DOCUMENT_POSITION_FOLLOWING,
            ),
        ).toEqual([0, 4, 4])
    })

    it('asks for the range the page is on', async () => {
        const fetchMock = await open('/usage?range=7d')

        expect(spendUrls(fetchMock)).toEqual([
            '/trail/api/usage/spend?range=7d',
        ])
    })
})

describe('the two figures of the header', () => {
    it('says what was recorded with its state, and what is projected with a plus and the word projected', async () => {
        await open()

        const recorded = within(figures()).getByText('Recorded').parentElement!
        const next = within(figures()).getByText(
            'Projected, next 24 hours',
        ).parentElement!

        // The last bucket's cumulative is pending, so it is the amount so far.
        expect(recorded).toHaveTextContent(formatCost(0.01315))
        expect(recorded).toHaveTextContent('So far')
        expect(next).toHaveTextContent(`+${formatCost(0.04011624)}`)
        expect(next).not.toHaveTextContent('So far')
        expect(figures()).not.toHaveTextContent(/\bcost\b/i)
    })

    it('labels a partly priced recorded figure partial', async () => {
        const last = series.buckets.at(-1) as SpendBucket

        await open('/usage', {
            ...spendFixture,
            data: {
                ...spendFixture.data,
                series: {
                    ...series,
                    buckets: [
                        ...series.buckets.slice(0, -1),
                        {
                            ...last,
                            cumulative: { state: 'partial', amount: 0.0131 },
                        },
                    ],
                },
            },
        })

        const recorded = within(figures()).getByText('Recorded').parentElement!

        expect(recorded).toHaveTextContent(formatCost(0.0131))
        expect(recorded).toHaveTextContent('Partial')
        expect(recorded).not.toHaveTextContent('So far')
    })

    it('says a recorded figure with nothing priced is unpriced, not zero', async () => {
        const last = series.buckets.at(-1) as SpendBucket

        await open('/usage', {
            ...spendFixture,
            data: {
                ...spendFixture.data,
                series: {
                    ...series,
                    buckets: [
                        ...series.buckets.slice(0, -1),
                        {
                            ...last,
                            cumulative: { state: 'unpriced', amount: null },
                        },
                    ],
                },
            },
        })

        const recorded = within(figures()).getByText('Recorded').parentElement!

        expect(recorded).toHaveTextContent('Unpriced')
        expect(recorded).not.toHaveTextContent('$')
    })

    it('says a pending recorded figure with no amount yet is pending', async () => {
        const last = series.buckets.at(-1) as SpendBucket

        await open('/usage', {
            ...spendFixture,
            data: {
                ...spendFixture.data,
                series: {
                    ...series,
                    buckets: [
                        ...series.buckets.slice(0, -1),
                        {
                            ...last,
                            cumulative: { state: 'pending', amount: null },
                        },
                    ],
                },
            },
        })

        expect(
            within(figures()).getByText('Recorded').parentElement,
        ).toHaveTextContent('Pending')
    })

    it.each([
        ['/usage?range=1h', 'Projected, next hour'],
        ['/usage?range=24h', 'Projected, next 24 hours'],
        ['/usage?range=7d', 'Projected, next 7 days'],
    ])('names the period of the range for %s', async (route, label) => {
        await open(route)

        expect(within(figures()).getByText(label)).toBeVisible()
    })

    it.each([
        [
            'not enough history',
            withoutProjection('not_enough_history', {
                buckets: 6,
                with_usage: 1,
            }),
        ],
        ['a range that is not current', withoutProjection('range_not_current')],
    ])('shows no projected figure for %s', async (_, none) => {
        await open('/usage', spendWith({ projection: none }))

        // The recorded figure is there, so the absence is the projected figure's own.
        expect(within(figures()).getByText('Recorded')).toBeVisible()
        expect(figures().querySelectorAll('dt')).toHaveLength(1)
        expect(figures()).not.toHaveTextContent('+')
        expect(figures()).not.toHaveTextContent(/projected/i)
    })
})

describe('the chart', () => {
    it('draws the recorded line solid and the projected line dashed, and names both', async () => {
        await open()

        const [recorded, projected] = curves()

        expect(curves()).toHaveLength(2)
        expect(recorded).not.toHaveAttribute('stroke-dasharray')
        expect(projected).toHaveAttribute('stroke-dasharray')
        expect(legend()).toBe('RecordedProjected')
    })

    it('draws a "Now" divider and a shaded region after it', async () => {
        await open()

        expect(within(panel()).getByText('Now')).toBeInTheDocument()
        expect(
            panel().querySelectorAll('.recharts-reference-line'),
        ).toHaveLength(1)
        expect(
            panel().querySelectorAll('.recharts-reference-area'),
        ).toHaveLength(1)
    })

    it('puts the divider where the recorded line ends: on the last recorded bucket, over the first point of the projection', async () => {
        await open()

        const divider = panel().querySelector('.recharts-reference-line line')!
        const area = panel().querySelector('.recharts-reference-area-rect')!

        expect(Number(area.getAttribute('x'))).toBeCloseTo(
            Number(divider.getAttribute('x1')),
            0,
        )
    })

    it('draws no point for a bucket without an amount: a gap, never a zero', async () => {
        await open()

        const recorded = curves()[0]
        // Twenty buckets before the first amount have none; the other four do.
        const withAmount = series.buckets.filter(
            (bucket) => bucket.cumulative.amount !== null,
        ).length

        expect(withAmount).toBe(4)
        expect(panel().querySelectorAll('circle')).toHaveLength(withAmount)
        // One piece: it starts at the first amount and is not drawn up from a zero.
        expect(recorded.getAttribute('d')?.match(/M/g)).toHaveLength(1)
    })

    it('sets the y axis from the projected amounts, which are the highest', async () => {
        await open()

        const labels = [
            ...panel().querySelectorAll(
                '.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value',
            ),
        ].map((label) => label.textContent)

        // The recorded total so far is $0.0132; the projected line reaches $0.0533.
        expect(labels.at(-1)).toBe(formatCost(0.06))
    })

    it('says in words which buckets follow the clock of the application', async () => {
        await open()

        expect(
            within(panel()).getByText(
                'Buckets follow the application’s time zone (UTC).',
            ),
        ).toBeVisible()
    })

    it('draws a recorded line alone, with no divider, no shading and no projected name, when there is no projection', async () => {
        await open(
            '/usage',
            spendWith({
                projection: withoutProjection('not_enough_history', {
                    buckets: 6,
                    with_usage: 2,
                }),
            }),
        )

        expect(curves()).toHaveLength(1)
        expect(legend()).toBe('Recorded')
        expect(within(panel()).queryByText('Now')).toBeNull()
        expect(panel().querySelector('.recharts-reference-line')).toBeNull()
        expect(panel().querySelector('.recharts-reference-area')).toBeNull()
    })
})

describe('the table behind the chart', () => {
    const rowsOf = async () => {
        await userEvent.click(
            within(panel()).getByRole('button', { name: 'View data' }),
        )

        const table = within(panel()).getByRole('table')

        return {
            table,
            headers: within(table)
                .getAllByRole('columnheader')
                .map((header) => header.textContent),
            rows: within(table).getAllByRole('row').slice(1),
        }
    }

    it('has a column for the recorded cost and its cumulative, and others for the projected amount and line', async () => {
        await open()

        const { table, headers } = await rowsOf()

        expect(headers).toEqual([
            'Time',
            'Recorded estimated cost',
            'Recorded estimated cost, cumulative',
            'Projected amount',
            'Projected line',
        ])
        expect(table).toHaveAccessibleName(/a projection is not a cost/)
    })

    it('has a row for each recorded bucket and then one for each projected bucket', async () => {
        await open()

        const { rows } = await rowsOf()

        expect(rows).toHaveLength(
            series.buckets.length + projection.buckets.length,
        )
        expect(rows).toHaveLength(48)
        expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent(
            'Jan 1, 12:00–13:00',
        )
        expect(within(rows[24]).getByRole('rowheader')).toHaveTextContent(
            'Jan 2, 12:00–13:00 (projected)',
        )
        expect(
            rows.filter((row) =>
                within(row)
                    .getByRole('rowheader')
                    .textContent?.includes('(projected)'),
            ),
        ).toHaveLength(24)
    })

    it('never puts a projected value in a recorded column, nor a recorded one in a projected column', async () => {
        await open()

        const { rows } = await rowsOf()
        const cells = (row: HTMLElement) =>
            within(row)
                .getAllByRole('cell')
                .map((cell) => cell.textContent ?? '')
        const recordedRows = rows.slice(0, series.buckets.length)
        const projectedRows = rows.slice(series.buckets.length)

        expect(recordedRows).not.toHaveLength(0)
        expect(projectedRows).not.toHaveLength(0)

        for (const row of recordedRows) {
            const [cost, cumulative, amount, line] = cells(row)

            expect(cost).not.toBe('')
            expect(cumulative).not.toBe('')
            expect(amount).toBe('')
            expect(line).toBe('')
        }

        for (const row of projectedRows) {
            const [cost, cumulative, amount, line] = cells(row)

            expect(cost).toBe('')
            expect(cumulative).toBe('')
            expect(amount).not.toBe('')
            expect(line).not.toBe('')
        }
    })

    it('says the recorded states with the telemetry words and writes no zero for a missing amount', async () => {
        await open()

        const { rows } = await rowsOf()
        const text = (row: number, cell: number) =>
            within(rows[row]).getAllByRole('cell')[cell]?.textContent

        // An hour with nothing recorded before the first amount.
        expect(text(0, 0)).toBe('Not captured')
        expect(text(0, 1)).toBe('Not captured')
        // 08:00: an estimated amount, and the cumulative so far.
        expect(text(20, 0)).toBe(formatCost(0.0002))
        expect(text(20, 1)).toBe(formatCost(0.0002))
        // 10:00 has no cost of its own, but the cumulative carries on.
        expect(text(22, 0)).toBe('Not captured')
        expect(text(22, 1)).toBe(formatCost(0.0042))
        // The last hour is still pending: the amount so far is labelled.
        expect(text(23, 0)).toMatch(
            new RegExp(`^\\${formatCost(0.00895)}So far`),
        )
        expect(text(23, 1)).toMatch(
            new RegExp(`^\\${formatCost(0.01315)}So far`),
        )

        const everyCell = within(within(panel()).getByRole('table'))
            .getAllByRole('cell')
            .map((cell) => cell.textContent)

        expect(everyCell.length).toBeGreaterThan(100)
        expect(everyCell).not.toContain(formatCost(0))
    })

    it('writes the projected amount and the projected line as they are in the response', async () => {
        await open()

        const { rows } = await rowsOf()
        const cellsOf = (row: number) =>
            within(rows[row])
                .getAllByRole('cell')
                .map((cell) => cell.textContent)

        expect(cellsOf(24)).toEqual([
            '',
            '',
            formatCost(0.00167151),
            formatCost(0.01482151),
        ])
        expect(cellsOf(47)).toEqual([
            '',
            '',
            formatCost(0.00167151),
            formatCost(0.05326624),
        ])
    })
})

describe('the sentences under the chart', () => {
    it('says the window the projection was taken from, the prices, that recorded costs stay, and what was left out', async () => {
        await open()

        expect(sentenceOf()).toBe(
            'Projected from the tokens recorded in the last 6 complete hours (3 with usage), priced at the prices saved now. Recorded costs do not change when a price changes. Left out: 1 run still in flight.',
        )
    })

    it('counts 5-minute buckets and days, as the response says them', async () => {
        await open(
            '/usage',
            spendWith({
                series: { ...series, bucket: '5m' },
                projection: {
                    ...projection,
                    window: { ...projection.window, buckets: 6, with_usage: 5 },
                    left_out: noLeftOut,
                },
            }),
        )

        expect(sentenceOf()).toBe(
            'Projected from the tokens recorded in the last 6 complete 5-minute buckets (5 with usage), priced at the prices saved now. Recorded costs do not change when a price changes.',
        )
    })

    it('counts days', async () => {
        await open(
            '/usage?range=7d',
            spendWith(
                {
                    series: { ...series, bucket: 'day' },
                    projection: {
                        ...projection,
                        window: {
                            ...projection.window,
                            buckets: 6,
                            with_usage: 6,
                        },
                        left_out: {
                            unpriced_steps: 2,
                            unpriced_tokens: null,
                            unfinished_runs: 0,
                        },
                    },
                },
                '7d',
            ),
        )

        expect(sentenceOf()).toBe(
            'Projected from the tokens recorded in the last 6 complete days (6 with usage), priced at the prices saved now. Recorded costs do not change when a price changes. Left out: 2 unpriced steps.',
        )
    })

    it('says unpriced steps with their tokens, in words, and draws nothing for them', async () => {
        await open(
            '/usage',
            spendWith({
                projection: {
                    ...projection,
                    left_out: {
                        unpriced_steps: 2,
                        unpriced_tokens: 5300,
                        unfinished_runs: 1,
                    },
                },
            }),
        )

        expect(sentenceOf()).toContain(
            'Left out: 2 unpriced steps (5,300 tokens) and 1 run still in flight.',
        )
        // The dashed line has a point for every projected hour and the one it starts from, no dip.
        expect(curves()[1]?.getAttribute('d')?.match(/M/g)).toHaveLength(1)
    })

    it('says nothing is left out by saying nothing', async () => {
        await open(
            '/usage',
            spendWith({ projection: { ...projection, left_out: noLeftOut } }),
        )

        expect(sentenceOf()).toMatch(/^Projected from the tokens recorded/)
        expect(sentenceOf()).not.toContain('Left out')
    })
})

describe('the states of the panel', () => {
    it('holds the place of the chart while it loads, with the header in place', async () => {
        mockQuietApi(undefined, never)
        renderApp('/usage')

        await screen.findByText('Pricing coverage')

        expect(
            within(panel()).getByText('Cumulative US dollars · estimates'),
        ).toBeVisible()
        expect(
            panel().querySelector('[data-slot="panel-loading"]'),
        ).not.toBeNull()
        expect(panel().querySelector('[data-slot="spend-figures"]')).toBeNull()
        expect(panel().querySelector('.recharts-wrapper')).toBeNull()
    })

    it('says in the panel alone that the estimated cost could not be loaded', async () => {
        mockQuietApi(undefined, () => json({ message: 'Down.' }, 500))
        renderApp('/usage')

        const alert = await screen.findByText(
            'The estimated cost could not be loaded',
        )

        expect(within(panel()).getByRole('alert')).toContainElement(alert)
        expect(within(panel()).getByRole('alert')).toHaveTextContent(
            'The server answered with an error (500).',
        )
        // The totals and the breakdown are fine.
        expect(await screen.findByText('claude-sonnet-4-5')).toBeVisible()
        expect(screen.getByText('Pricing coverage')).toBeVisible()
        expect(screen.getAllByRole('alert')).toHaveLength(1)
    })

    it('keeps the retry button while it runs, then draws the chart and moves focus to the page heading', async () => {
        const fetchMock = mockQuietApi(undefined, () =>
            json({ message: 'Down.' }, 500),
        )
        renderApp('/usage')
        await screen.findByText('The estimated cost could not be loaded')

        const retry = deferred()

        fetchMock.mockImplementation((url) =>
            url.includes('/api/usage/spend') ? retry.promise : json({}),
        )

        const button = within(panel()).getByRole('button', {
            name: 'Try again',
        })

        button.focus()
        await userEvent.click(button)
        await waitFor(() => expect(spendUrls(fetchMock)).toHaveLength(2))

        expect(within(panel()).getByRole('button', { name: 'Try again' })).toBe(
            button,
        )
        expect(button).toHaveFocus()
        expect(panel().querySelector('.recharts-wrapper')).toBeNull()

        retry.resolve(new Response(JSON.stringify(spendFor('?range=24h'))))
        await loaded()

        expect(curves()).toHaveLength(2)
        expect(
            screen.getByRole('heading', { level: 1, name: 'Usage & cost' }),
        ).toHaveFocus()
    })

    it('says there is no estimated cost to draw when nothing was recorded, and why there is no projection', async () => {
        await open(
            '/usage',
            spendWith({
                series: {
                    ...series,
                    buckets: allBuckets({
                        state: 'not_captured',
                        amount: null,
                    }),
                },
                projection: withoutProjection('not_enough_history', {
                    buckets: 6,
                    with_usage: 0,
                }),
            }),
        )

        expect(
            within(panel()).getByText(
                'No usage was recorded in this range, so there is no estimated cost to draw.',
            ),
        ).toBeVisible()
        expect(sentenceOf()).toBe(
            'Not enough recent usage to project: 0 of the last 6 complete hours have recorded usage; 3 are needed.',
        )
        expect(panel().querySelector('.recharts-wrapper')).toBeNull()
        expect(
            within(panel()).queryByRole('button', { name: 'View data' }),
        ).toBeNull()
        expect(
            within(figures()).getByText('Recorded').parentElement,
        ).toHaveTextContent('Not captured')
        expect(panel()).not.toHaveTextContent('$')
    })

    it('says usage that could not be priced is not an estimated cost of zero', async () => {
        await open(
            '/usage',
            spendWith({
                series: {
                    ...series,
                    buckets: allBuckets({ state: 'unpriced', amount: null }),
                },
                projection: withoutProjection('not_enough_history', null),
            }),
        )

        expect(
            within(panel()).getByText(
                'Usage was recorded in this range, but none of it could be priced, so there is no estimated cost to draw.',
            ),
        ).toBeVisible()
        expect(panel()).not.toHaveTextContent('$')
        expect(sentenceOf()).toBe(
            'Not enough recent usage to project: no complete hour yet.',
        )
    })

    it('says runs that are still running with nothing recorded yet', async () => {
        await open(
            '/usage',
            spendWith({
                series: {
                    ...series,
                    buckets: allBuckets({ state: 'pending', amount: null }),
                },
                projection: withoutProjection('not_enough_history', {
                    buckets: 6,
                    with_usage: 0,
                }),
            }),
        )

        expect(
            within(panel()).getByText(
                'Runs in this range are still running and no estimated cost has been recorded yet.',
            ),
        ).toBeVisible()
    })

    it('says exactly how much history there is when it is not enough, and draws the recorded line alone', async () => {
        await open(
            '/usage',
            spendWith({
                projection: withoutProjection('not_enough_history', {
                    buckets: 6,
                    with_usage: 2,
                }),
            }),
        )

        expect(sentenceOf()).toBe(
            'Not enough recent usage to project: 2 of the last 6 complete hours have recorded usage; 3 are needed.',
        )
        expect(curves()).toHaveLength(1)
    })

    it('says there is no complete bucket yet when there is no window', async () => {
        await open(
            '/usage',
            spendWith({
                projection: withoutProjection('not_enough_history', null),
            }),
        )

        expect(sentenceOf()).toBe(
            'Not enough recent usage to project: no complete hour yet.',
        )
        expect(curves()).toHaveLength(1)
    })

    it('says a projection is only made for a range that ends now, and says what was left out of nothing', async () => {
        await open(
            '/usage',
            spendWith({ projection: withoutProjection('range_not_current') }),
        )

        expect(sentenceOf()).toBe(
            'A projection is only made for a range that ends now.',
        )
        expect(curves()).toHaveLength(1)
        expect(within(panel()).queryByText('Now')).toBeNull()
    })

    it('still says what was left out when there is no projection', async () => {
        await open(
            '/usage',
            spendWith({
                projection: withoutProjection(
                    'not_enough_history',
                    { buckets: 6, with_usage: 2 },
                    {
                        unpriced_steps: 1,
                        unpriced_tokens: 40,
                        unfinished_runs: 0,
                    },
                ),
            }),
        )

        expect(sentenceOf()).toBe(
            'Not enough recent usage to project: 2 of the last 6 complete hours have recorded usage; 3 are needed. Left out: 1 unpriced step (40 tokens).',
        )
    })
})

describe('the panel while the next range loads', () => {
    it('keeps the previous chart, dimmed and announced once, with the announcement outside the busy part', async () => {
        const next = deferred()

        mockQuietApi(undefined, (url) =>
            url.includes('range=7d') ? next.promise : json(spendFor(url)),
        )
        renderApp('/usage')
        await loaded()

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(
            screen.getByRole('option', { name: 'Last 7 days' }),
        )

        await waitFor(() =>
            expect(
                panel().querySelector('[data-slot="busy-region"]'),
            ).toHaveAttribute('aria-busy', 'true'),
        )

        const region = panel().querySelector<HTMLElement>(
            '[data-slot="busy-region"]',
        )!

        // The previous chart is still there, inside the busy part.
        expect(curves()).toHaveLength(2)
        expect(region).toContainElement(curves()[0] as unknown as HTMLElement)
        expect(within(region).queryByRole('status')).toBeNull()
        expect(
            within(panel())
                .getAllByRole('status')
                .map((status) => status.textContent),
        ).toEqual(['Loading the estimated cost'])
        // Its words are the previous range's: 24 hours.
        expect(
            within(figures()).getByText('Projected, next 24 hours'),
        ).toBeVisible()

        next.resolve(new Response(JSON.stringify(spendFor('?range=7d'))))

        await waitFor(() =>
            expect(
                panel().querySelector('[data-slot="busy-region"]'),
            ).not.toHaveAttribute('aria-busy'),
        )
        expect(
            within(figures()).getByText('Projected, next 7 days'),
        ).toBeVisible()
        expect(
            within(panel())
                .getAllByRole('status')
                .map((status) => status.textContent),
        ).toEqual([''])
    })
})
