import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { formatCost } from '@/lib/format'
import { renderApp } from '@/test/render-app'
import { priceFixture, pricesFixture } from '@/test/prices-api'
import {
    breakdownUrls,
    json,
    mockApi,
    quietUsage,
    quietUsageFor,
    usageUrls,
    usageWith,
} from '@/test/usage-api'
import { until } from '@/test/wait'

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

const totals = () => screen.findByText('Pricing coverage')
const review = () =>
    within(metric('Pricing coverage')).queryByRole('link', {
        name: 'Review prices',
    })

describe('the way from the coverage figure to the prices', () => {
    it('leads to the model prices and moves focus to their heading, beside the link to the unpriced runs', async () => {
        const user = userEvent.setup()
        mockApi()
        renderApp('/usage?range=7d')
        await totals()

        const link = within(metric('Pricing coverage')).getByRole('link', {
            name: 'Review prices',
        })

        expect(
            within(metric('Pricing coverage')).getByRole('link', {
                name: 'Pricing coverage',
            }),
        ).toHaveAttribute('href', '/trail/traces?range=7d&unpriced=1')

        await user.click(link)

        expect(
            screen.getByRole('heading', { level: 2, name: 'Model prices' }),
        ).toHaveFocus()
        // The click stayed on this page.
        expect(window.location.pathname).toBe('/trail/usage')
        expect(window.location.hash).toBe('')
    })

    it('can be followed with the keyboard', async () => {
        const user = userEvent.setup()
        mockApi()
        renderApp('/usage')
        await totals()

        review()?.focus()
        await user.keyboard('{Enter}')

        expect(
            screen.getByRole('heading', { level: 2, name: 'Model prices' }),
        ).toHaveFocus()
    })

    it('is there when only steps are unpriced', async () => {
        mockApi(() =>
            json(
                usageWith(
                    {
                        cost_coverage: {
                            unpriced_runs: 0,
                            runs_without_amount: 0,
                        },
                    },
                    { unpriced_steps: 3, unpriced_tokens: 30 },
                ),
            ),
        )
        renderApp('/usage')
        await totals()

        expect(review()).toBeVisible()
        expect(metric('Pricing coverage')).toHaveTextContent('3 unpriced steps')
    })

    it('is not there when every step was priced', async () => {
        mockApi(() =>
            json(
                usageWith(
                    {
                        ...quietUsage().data.summary,
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

        expect(metric('Pricing coverage')).toHaveTextContent(
            'Every step that reported usage was priced',
        )
        expect(review()).not.toBeInTheDocument()
    })
})

describe('the prices on the page', () => {
    it('sits below the breakdown, as a panel of its own', async () => {
        mockApi(undefined, undefined, undefined, () => json(pricesFixture))
        renderApp('/usage')
        await totals()

        const table = await screen.findByRole('table', {
            name: /^Model prices/,
        })
        const breakdown = await screen.findByRole('heading', {
            name: 'Usage breakdown',
        })

        expect(
            breakdown.compareDocumentPosition(table) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy()
    })

    it('changes no figure above it when a price is saved, and asks for none again', async () => {
        const user = userEvent.setup()
        const fetchMock = mockApi(
            (url) => json(quietUsageFor(url)),
            undefined,
            undefined,
            (_, init) =>
                json(init?.method === 'PUT' ? priceFixture : pricesFixture),
        )
        renderApp('/usage')
        await totals()
        await screen.findByRole('table', { name: /^Model prices/ })
        await screen.findByRole('table', { name: /^Usage by / })

        const before = {
            cost: metric('Estimated cost').textContent,
            coverage: metric('Pricing coverage').textContent,
            totals: usageUrls(fetchMock).length,
            breakdown: breakdownUrls(fetchMock).length,
        }

        expect(before.cost).toContain(formatCost(0.01315))

        await user.click(
            screen.getByRole('button', {
                name: 'Edit the price of anthropic claude-sonnet-4-5-20250929',
            }),
        )
        await user.type(
            screen.getByRole('textbox', {
                name: 'Input rate for anthropic claude-sonnet-4-5-20250929, US dollars per million tokens',
            }),
            '9',
        )

        // Unsaved edits change nothing.
        expect(metric('Estimated cost').textContent).toBe(before.cost)

        await user.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() =>
            expect(
                screen.queryByRole('form', { name: /^Edit the price of / }),
            ).not.toBeInTheDocument(),
        )
        await until(() =>
            expect(
                fetchMock.mock.calls.filter(([url]) =>
                    url.includes('/api/prices'),
                ),
            ).toHaveLength(3),
        )

        expect(metric('Estimated cost').textContent).toBe(before.cost)
        expect(metric('Pricing coverage').textContent).toBe(before.coverage)
        expect(usageUrls(fetchMock)).toHaveLength(before.totals)
        expect(breakdownUrls(fetchMock)).toHaveLength(before.breakdown)
    })
})
