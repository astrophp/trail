import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Price } from '@/api/types'
import { RerankingPriceSummary } from '@/features/usage/reranking-price-summary'
import { renderApp } from '@/test/render-app'
import {
    editButton,
    listOf,
    mockPrices,
    mystery,
    renderPrices,
    sonnet,
    tableLoaded,
} from '@/test/prices-api'
import { stubResizeObserver } from '@/test/resize-observer'
import { json, mockQuietApi, spendFor } from '@/test/usage-api'

// The wording reads the install's currency from the boot object, which is kept after first use:
// the tests set what it holds before each render.
const install = vi.hoisted<{ currency: string | null }>(() => ({
    currency: 'USD',
}))

vi.mock('@/lib/boot', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/boot')>()

    return {
        ...actual,
        boot: () =>
            actual.parseBoot({
                csrfToken: 'token',
                currency: install.currency,
            }),
    }
})

afterEach(() => {
    install.currency = 'USD'
})

const rates = {
    basis: 'search_units' as const,
    input: null,
    search_unit: 0.1,
}

const reranked: Price = {
    ...mystery,
    reranking: {
        rates,
        source: 'config',
        via: null,
        default: { rates, source: 'config', via: null },
        saved_at: null,
    },
}

describe('the model prices wording in the install currency', () => {
    it.each([
        [
            'USD',
            'Token rates are US dollars per million tokens. A saved price applies to runs recorded from now on; recorded costs stay as they were. A long-running worker can take a minute to pick it up. Reranking rates show their billing unit.',
        ],
        [
            'EUR',
            'Token rates are EUR per million tokens. A saved price applies to runs recorded from now on; recorded costs stay as they were. A long-running worker can take a minute to pick it up. Reranking rates show their billing unit. Bundled prices are in US dollars and are not used.',
        ],
        [
            null,
            'Token rates are per million tokens. A saved price applies to runs recorded from now on; recorded costs stay as they were. A long-running worker can take a minute to pick it up. Reranking rates show their billing unit.',
        ],
    ])('says what the token rates are in for %s', async (currency, text) => {
        install.currency = currency
        mockPrices()
        renderPrices()
        await tableLoaded()

        // The tooltip measures itself; jsdom has nothing to measure with.
        stubResizeObserver()
        await userEvent.hover(
            screen.getByRole('button', { name: 'About model prices' }),
        )

        const hint = await screen.findByRole('tooltip')

        expect(hint).toHaveTextContent(text)

        if (currency !== 'EUR') {
            expect(hint).not.toHaveTextContent('Bundled prices')
        }
    })

    it.each([
        ['USD', 'Model prices: token rates in US dollars per million tokens'],
        ['EUR', 'Model prices: token rates in EUR per million tokens'],
        [null, 'Model prices: token rates per million tokens'],
    ])('captions the table for %s', async (currency, caption) => {
        install.currency = currency
        mockPrices()
        renderPrices()
        const table = await tableLoaded()

        expect(table).toHaveAccessibleName(
            `${caption}; reranking rates show their billing unit`,
        )
    })

    it.each([
        ['USD', 'US dollars per million tokens'],
        ['EUR', 'EUR per million tokens'],
        [null, 'per million tokens'],
    ])('names an editor field for %s', async (currency, unit) => {
        install.currency = currency
        const user = userEvent.setup()
        mockPrices()
        renderPrices()
        await tableLoaded()
        await user.click(editButton(sonnet))

        expect(
            screen.getByRole('textbox', {
                name: `Input rate for ${sonnet.provider} ${sonnet.model}, ${unit}`,
            }),
        ).toBeVisible()
    })
})

describe('the reranking wording in the install currency', () => {
    it.each([
        ['USD', 'Reranking: USD 0.1 per search unit'],
        ['EUR', 'Reranking: EUR 0.1 per search unit'],
        [null, 'Reranking: 0.1 per search unit'],
    ])('labels the unit rate in the summary for %s', (currency, text) => {
        install.currency = currency
        const { container } = render(<RerankingPriceSummary price={reranked} />)

        expect(container).toHaveTextContent(text)
        expect(container).not.toHaveTextContent('Reranking:  ')
    })

    it.each([
        ['USD', 'USD per million input tokens', 'USD per search unit'],
        ['EUR', 'EUR per million input tokens', 'EUR per search unit'],
        [null, 'Per million input tokens', 'Per search unit'],
    ])('labels the editor fields for %s', async (currency, input, unit) => {
        install.currency = currency
        const user = userEvent.setup()
        mockPrices(() => listOf([reranked]))
        renderPrices()
        await tableLoaded()
        await user.click(
            screen.getByRole('button', {
                name: `Edit reranking prices of ${reranked.provider} ${reranked.model}`,
            }),
        )

        expect(screen.getByLabelText(input)).toBeVisible()
        expect(screen.getByLabelText(unit)).toBeVisible()
    })
})

describe('the estimated cost panel wording in the install currency', () => {
    it.each([
        ['USD', 'Cumulative US dollars · estimates'],
        ['EUR', 'Cumulative EUR · estimates'],
        [null, 'Cumulative amounts · estimates'],
    ])('describes the chart for %s', async (currency, text) => {
        install.currency = currency
        mockQuietApi(undefined, (url) => json(spendFor(url)))
        renderApp('/usage')

        expect(await screen.findByText(text)).toBeVisible()
    })
})
