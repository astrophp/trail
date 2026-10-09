import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { forgetUsageRefreshFailures } from '@/features/usage/use-usage'
import { forgetUsageBreakdownRefreshFailures } from '@/features/usage/use-usage-breakdown'
import { formatCost } from '@/lib/format'
import { renderApp } from '@/test/render-app'
import {
    deferred,
    json,
    mockApi,
    mockQuietApi,
    paramsOf,
    quietUsage,
    quietUsageFor,
    usageFixture,
    usageUrls,
    usageWith,
} from '@/test/usage-api'

beforeEach(() => {
    forgetUsageRefreshFailures()
    forgetUsageBreakdownRefreshFailures()
})

/** The element of a metric, found by its label. */
function metric(label: string): HTMLElement {
    const found = [...document.querySelectorAll('[data-slot="metric"]')].find(
        (element) => element.querySelector('dt')?.textContent === label,
    )

    if (!(found instanceof HTMLElement)) {
        throw new Error(`No metric called ${label}.`)
    }

    return found
}

/** What a metric says: its value, then the lines under it. */
const wordsOf = (label: string) =>
    [...metric(label).querySelectorAll('dd')].map((dd) => dd.textContent)

const strip = () => document.querySelector('[data-slot="metric-strip"]')

/** The totals are in. */
const totals = () => screen.findByText('Pricing coverage')

describe('the page', () => {
    it('is titled Usage & cost and says once that the amounts are estimates', async () => {
        mockQuietApi()
        renderApp('/usage')
        await totals()

        expect(
            screen.getByRole('heading', { level: 1, name: 'Usage & cost' }),
        ).toBeVisible()
        expect(screen.getAllByText(/not provider invoices/)).toHaveLength(1)
        expect(
            screen.getByText(
                /^Token usage and estimated cost of recorded runs/,
            ),
        ).toBeVisible()
        expect(document.title).toBe('Usage & cost · Trail')
    })

    it('asks for the totals of the range in the address', async () => {
        const fetchMock = mockQuietApi()
        renderApp('/usage?range=7d')
        await totals()

        expect(usageUrls(fetchMock)).toEqual(['/trail/api/usage?range=7d'])
    })
})

describe('the estimated cost', () => {
    it('shows the amount so far, labelled, while runs are running', async () => {
        mockApi()
        renderApp('/usage')
        await totals()

        const cost = metric('Estimated cost')

        expect(cost).toHaveTextContent(formatCost(11.48))
        expect(within(cost).getByText('So far')).toBeVisible()
    })

    it('says Pending, with no amount, when the amount so far is not known', async () => {
        mockApi((url) =>
            json({
                ...usageWith({ cost: { state: 'pending', amount: null } }),
                range: quietUsageFor(url).range,
            }),
        )
        renderApp('/usage')
        await totals()

        expect(wordsOf('Estimated cost')[0]).toBe('Pending')
    })

    it('labels a total that covers only part of the steps', async () => {
        mockQuietApi()
        renderApp('/usage')
        await totals()

        const cost = metric('Estimated cost')

        expect(cost).toHaveTextContent(formatCost(11.48))
        expect(within(cost).getByText(/^Partial/)).toBeVisible()
        expect(within(cost).queryByText('So far')).not.toBeInTheDocument()
    })

    it('says Unpriced for a range nothing could be priced in, never a zero', async () => {
        mockApi(() =>
            json(
                usageWith({
                    runs: usageFixture.data.summary.runs,
                    cost: { state: 'unpriced', amount: null },
                }),
            ),
        )
        renderApp('/usage')
        await totals()

        expect(wordsOf('Estimated cost')[0]).toBe('Unpriced')
        expect(metric('Estimated cost')).not.toHaveTextContent('$0')
    })

    it('leads to the runs of the range, the dearest first', async () => {
        mockQuietApi()
        renderApp('/usage?range=7d')
        await totals()

        expect(
            within(metric('Estimated cost'))
                .getByRole('link')
                .getAttribute('href'),
        ).toBe('/trail/traces?range=7d&sort=-cost')
    })
})

describe('the tokens', () => {
    it('says Pending for the total while runs are running, and no parts that can still grow', async () => {
        mockApi()
        renderApp('/usage')
        await totals()

        expect(wordsOf('Total tokens')).toEqual(['Pending'])
    })

    it('shows the total, the input with its cached part, and the output', async () => {
        mockQuietApi()
        renderApp('/usage')
        await totals()

        const words = wordsOf('Total tokens')

        expect(words[0]).toMatch(/7\.9M.*7,901,600 tokens/)
        // The cached tokens are part of the input: they are said to be, and not added to it.
        expect(words[1]).toBe(
            'Input 7,280,000 (of which 430,200 cached) · Output 621,600',
        )
    })

    it('leaves the cached part out when no cache read was reported', async () => {
        mockApi((url) =>
            json({
                ...quietUsage(),
                data: {
                    ...quietUsage().data,
                    summary: {
                        ...quietUsage().data.summary,
                        usage: {
                            ...quietUsage().data.summary.usage,
                            cache_read_tokens: null,
                        },
                    },
                },
                range: quietUsageFor(url).range,
            }),
        )
        renderApp('/usage')
        await totals()

        expect(wordsOf('Total tokens')[1]).toBe(
            'Input 7,280,000 · Output 621,600',
        )
    })

    it('says Not reported, not zero, when no count was reported', async () => {
        mockApi(() =>
            json(
                usageWith({
                    runs: quietUsage().data.summary.runs,
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
            ),
        )
        renderApp('/usage')
        await totals()

        expect(wordsOf('Total tokens')[0]).toBe('Not reported')
        expect(wordsOf('Total tokens')[1]).toBe(
            'Input Not reported · Output Not reported',
        )
    })
})

describe('the pricing coverage', () => {
    it('counts the runs, steps and tokens that had no rate, and leads to those runs', async () => {
        mockApi()
        renderApp('/usage?range=7d')
        await totals()

        expect(wordsOf('Pricing coverage')).toEqual([
            '8 runs',
            '11 steps · 24.8k tokens without a rate',
        ])
        expect(
            within(metric('Pricing coverage'))
                .getByRole('link')
                .getAttribute('href'),
        ).toBe('/trail/traces?range=7d&unpriced=1')
    })

    it('leaves the tokens out when the unpriced steps reported none', async () => {
        mockApi(() => json(usageWith({}, { unpriced_tokens: null })))
        renderApp('/usage')
        await totals()

        expect(wordsOf('Pricing coverage')).toEqual([
            '8 runs',
            '11 steps without a rate',
        ])
        expect(metric('Pricing coverage')).not.toHaveTextContent(
            /tokens|Not captured|\b0\b/,
        )
    })

    it('speaks in the singular for one run and one step', async () => {
        mockApi(() =>
            json(
                usageWith(
                    {
                        cost_coverage: {
                            unpriced_runs: 1,
                            runs_without_amount: 0,
                        },
                    },
                    { unpriced_steps: 1, unpriced_tokens: 1 },
                ),
            ),
        )
        renderApp('/usage')
        await totals()

        expect(wordsOf('Pricing coverage')).toEqual([
            '1 run',
            '1 step · 1 token without a rate',
        ])
    })

    it('says every step was priced when none was left out', async () => {
        mockApi(() =>
            json(
                usageWith(
                    {
                        cost_coverage: {
                            unpriced_runs: 0,
                            runs_without_amount: 0,
                        },
                    },
                    { unpriced_steps: 0, unpriced_tokens: 0 },
                ),
            ),
        )
        renderApp('/usage')
        await totals()

        expect(wordsOf('Pricing coverage')).toEqual([
            'Every step that reported usage was priced',
        ])
        expect(metric('Pricing coverage')).not.toHaveTextContent(
            'without a rate',
        )
        expect(
            within(metric('Pricing coverage')).queryByRole('link'),
        ).not.toBeInTheDocument()
    })

    it('does not call a range priced when no step reported usage', async () => {
        mockApi(() =>
            json(
                usageWith(
                    {},
                    {
                        reported_steps: 0,
                        unpriced_steps: 0,
                        unpriced_tokens: 0,
                    },
                ),
            ),
        )
        renderApp('/usage')
        await totals()

        expect(wordsOf('Pricing coverage')).toEqual(['No step reported usage'])
    })
})

describe('while the totals load', () => {
    it('draws the strip’s shape, then the figures', async () => {
        const pending = deferred()
        mockApi(() => pending.promise)
        renderApp('/usage')

        await waitFor(() =>
            expect(
                document.querySelector('[data-slot="metric-strip-skeleton"]'),
            ).not.toBeNull(),
        )
        expect(strip()).toBeNull()

        pending.resolve(new Response(JSON.stringify(usageFixture)))
        await totals()

        expect(strip()).not.toBeNull()
    })

    it('keeps the previous range’s figures, dimmed, under their own links, until the next arrive', async () => {
        const next = deferred()
        mockApi((url) =>
            paramsOf(url).range === '1h'
                ? next.promise
                : json({
                      ...quietUsage(),
                      range: quietUsageFor(url).range,
                  }),
        )
        renderApp('/usage')
        await totals()

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(screen.getByRole('option', { name: 'Last hour' }))

        await waitFor(() =>
            expect(strip()?.closest('[aria-busy="true"]')).not.toBeNull(),
        )
        expect(metric('Estimated cost')).toHaveTextContent(formatCost(11.48))
        expect(
            within(metric('Estimated cost'))
                .getByRole('link')
                .getAttribute('href'),
        ).toBe('/trail/traces?sort=-cost')
        expect(screen.getByText('Loading the totals')).toBeInTheDocument()

        next.resolve(
            new Response(
                JSON.stringify({
                    ...quietUsage('1h'),
                    data: {
                        ...quietUsage('1h').data,
                        summary: {
                            ...quietUsage('1h').data.summary,
                            cost: { state: 'estimated', amount: 0.5 },
                        },
                    },
                }),
            ),
        )
        await waitFor(() =>
            expect(metric('Estimated cost')).toHaveTextContent(formatCost(0.5)),
        )
        expect(strip()?.closest('[aria-busy="true"]')).toBeNull()
        expect(
            within(metric('Estimated cost'))
                .getByRole('link')
                .getAttribute('href'),
        ).toBe('/trail/traces?range=1h&sort=-cost')
    })

    it('keeps no status region inside the dimmed part', async () => {
        mockApi()
        renderApp('/usage')
        await totals()

        const busy = strip()?.closest('[data-slot="busy-region"]')

        expect(busy).not.toBeNull()
        expect(within(busy as HTMLElement).queryByRole('status')).toBeNull()
    })
})

describe('when the totals cannot be loaded', () => {
    it('says so in place of the strip, while the breakdown below keeps its own state', async () => {
        mockApi(
            () => json({ message: 'The database is down.' }, 500),
            undefined,
        )
        renderApp('/usage')

        const alert = await screen.findByRole('alert')

        expect(alert).toHaveTextContent('The usage totals could not be loaded')
        expect(alert).toHaveTextContent('The database is down.')
        expect(strip()).toBeNull()
        expect(
            await screen.findByRole('table', { name: /^Usage by / }),
        ).toBeVisible()
    })

    it('keeps the retry button while it runs, then shows the figures and moves focus to the page heading', async () => {
        const fetchMock = mockApi(() => json({ message: 'Down.' }, 500))
        renderApp('/usage')
        await screen.findByRole('alert')

        const retry = deferred()
        fetchMock.mockImplementation((url) =>
            url.includes('/api/meta')
                ? json({})
                : url.includes('/api/usage/breakdown')
                  ? json({})
                  : retry.promise,
        )

        const button = screen.getByRole('button', { name: 'Try again' })
        button.focus()
        await userEvent.click(button)

        await waitFor(() => expect(usageUrls(fetchMock)).toHaveLength(2))

        const trying = screen.getByRole('button', { name: 'Trying again…' })

        expect(trying).toBe(button)
        expect(trying).toHaveFocus()

        retry.resolve(new Response(JSON.stringify(quietUsage())))
        await totals()

        expect(
            screen.getByRole('heading', { level: 1, name: 'Usage & cost' }),
        ).toHaveFocus()
    })
})
