import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { BrowserRouter, Link } from 'react-router'
import { expect, vi } from 'vitest'
import type {
    Price,
    PriceListResponse,
    PriceRates,
    PriceResponse,
} from '@/api/types'
import { ModelPrices } from '@/features/usage/model-prices'
import { BootContext } from '@/hooks/use-boot'
import { contractFixture } from '@/test/contract-fixture'
import { testBoot, testQueryClient } from '@/test/render-app'
import { json, type Handler } from '@/test/traces-api'

export { deferred, json, type Handler } from '@/test/traces-api'

/** The list the contract test froze: a model of every source, seven models, four of them seen in usage. */
export const pricesFixture = contractFixture('prices') as PriceListResponse

/** The answer to a save the contract test froze: a prefix model with a price of its own now. */
export const priceFixture = contractFixture('price') as PriceResponse

/**
 * The fixture's models by what they show: seen and unpriced, seen and in the config, seen through
 * a config id, seen through a saved id, in the config only, saved over a config entry (with a
 * blank cache write) and saved over nothing (with a free cache read).
 */
export const [mystery, sonnet, sonnetDated, gptDated, gpt4o, gpt5, gpt5Mini] =
    pricesFixture.data

/** The list endpoint's answer for `prices`, with the limit the fixture has unless told otherwise. */
export function listOf(
    prices: Price[],
    limit: Partial<PriceListResponse['limit']> = {},
): PriceListResponse {
    return {
        data: prices,
        limit: {
            ...pricesFixture.limit,
            total: prices.length,
            ...limit,
        },
    }
}

/** What a model is priced at once saved with `rates`: a saved price, with the default it replaced. */
export function savedAs(
    price: Price,
    rates: PriceRates,
    saved_at = '2026-02-03T10:00:00.000Z',
): Price {
    return {
        ...price,
        rates,
        source: 'saved',
        via: null,
        default:
            price.source === 'saved'
                ? price.default
                : {
                      source: price.source,
                      via: price.via,
                      rates: price.rates,
                  },
        saved_at,
    }
}

/** What a model is priced at once its saved price is removed: its default. */
export function resetTo(price: Price): Price {
    return {
        ...price,
        ...price.default,
        saved_at: null,
    }
}

const isPrices = (url: string) => url.includes('/api/prices')

/** Every request the panel made to the prices endpoint, as the test sees it. */
export type PriceCall = {
    method: string
    url: string
    body: unknown
    csrf: string | null
}

function callOf([url, init]: Parameters<Handler>): PriceCall {
    const headers = (init?.headers ?? {}) as Record<string, string>

    return {
        method: init?.method ?? 'GET',
        url,
        body:
            typeof init?.body === 'string'
                ? (JSON.parse(init.body) as unknown)
                : undefined,
        csrf: headers['X-CSRF-TOKEN'] ?? null,
    }
}

/**
 * Answers `GET /api/prices` with `list` (a function, so a test can change what the next read
 * sees) and a write with `write`, which a test gives for the case it is about.
 */
export function mockPrices(
    list: () => PriceListResponse = () => pricesFixture,
    write: Handler = () => json(priceFixture),
) {
    const fetchMock = vi.fn<Handler>((url, init) => {
        if (!isPrices(url)) {
            return Promise.reject(new Error(`Unmocked fetch: ${url}`))
        }

        return (init?.method ?? 'GET') === 'GET'
            ? json(list())
            : write(url, init)
    })
    vi.stubGlobal('fetch', fetchMock)

    return fetchMock
}

/**
 * A server that keeps the list: a write is answered with the price a test gave it (`answers`),
 * and the list the next read sees has that price in the model's place.
 */
export function priceServer(initial: Price[] = pricesFixture.data) {
    let current = initial
    let answer: Price | null = null
    const fetchMock = mockPrices(
        () => listOf(current),
        () => {
            if (answer === null) {
                return Promise.reject(new Error('A write nobody answered'))
            }

            const price = answer
            current = current.map((candidate) =>
                candidate.provider === price.provider &&
                candidate.model === price.model
                    ? price
                    : candidate,
            )

            return json({ data: price })
        },
    )

    return {
        fetchMock,
        /** The price the next write is answered with. */
        answers: (price: Price) => {
            answer = price
        },
        /** What the next read sees, as if another process had changed it. */
        set: (prices: Price[]) => {
            current = prices
        },
    }
}

type Mock = ReturnType<typeof mockPrices>

/** The calls made to the prices endpoint so far. */
export const priceCalls = (fetchMock: Mock): PriceCall[] =>
    fetchMock.mock.calls.filter(([url]) => isPrices(url)).map(callOf)

/** The reads of the list made so far. */
export const priceReads = (fetchMock: Mock) =>
    priceCalls(fetchMock).filter((call) => call.method === 'GET')

/** The saves and resets made so far. */
export const priceWrites = (fetchMock: Mock) =>
    priceCalls(fetchMock).filter((call) => call.method !== 'GET')

/**
 * Renders the price panel as the Usage page places it, with a link to another page beside it.
 * The URL is set first, as the server would have served it.
 */
export function renderPrices({
    search = '',
    client = testQueryClient(),
    beside,
}: {
    search?: string
    client?: ReturnType<typeof testQueryClient>
    beside?: ReactNode
} = {}) {
    // The API client reads the CSRF token from the page's boot object, once.
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'token',
    }
    window.history.pushState({}, '', `/trail/usage${search}`)

    return render(
        <BootContext value={testBoot()}>
            <QueryClientProvider client={client}>
                <BrowserRouter basename="/trail">
                    <Link to="/traces">Traces</Link>
                    {/* The shell's main region: where focus goes when a control it held is gone. */}
                    <main id="content" tabIndex={-1}>
                        <h1 tabIndex={-1}>Usage &amp; cost</h1>
                        {beside}
                        <ModelPrices />
                    </main>
                </BrowserRouter>
            </QueryClientProvider>
        </BootContext>,
    )
}

/** The panel's list is in: the table is there and not loading. */
export const tableLoaded = () =>
    screen.findByRole('table', { name: /^Model prices/ })

export const table = () => screen.getByRole('table', { name: /^Model prices/ })

const priceRows = () =>
    within(table())
        .getAllByRole('row')
        .filter((row) => row.getAttribute('data-slot') === 'price-row')

/** A row's model as `provider model`: the label shows the model first and its provider under it. */
function nameOf(row: HTMLElement): string {
    const label = row.querySelector('[data-slot="model-label"]')

    return `${label?.children[1]?.textContent ?? ''} ${label?.children[0]?.textContent ?? ''}`
}

/** The row of a model, found by its provider and model. */
export function rowOf(price: Pick<Price, 'provider' | 'model'>): HTMLElement {
    const row = priceRows().find(
        (candidate) => nameOf(candidate) === `${price.provider} ${price.model}`,
    )

    if (row === undefined) {
        throw new Error(`No row for ${price.provider} ${price.model}.`)
    }

    return row
}

/** The names of the models listed, in order, as `provider model`. */
export const listed = () => priceRows().map(nameOf)

/** A read-only cell of a row by the rate it holds or `source`. */
export function cellOf(row: HTMLElement, column: string): HTMLElement {
    const cell =
        column === 'source'
            ? row.querySelector<HTMLElement>('[data-column="source"]')
            : row.querySelector<HTMLElement>(`[data-rate="${column}"]`)

    if (cell === null) {
        throw new Error(`No ${column} cell.`)
    }

    return cell
}

/** The form of a model being edited. */
export const formOf = (price: Pick<Price, 'provider' | 'model'>) =>
    screen.getByRole('form', {
        name: `Edit the price of ${price.provider} ${price.model}`,
    })

/** One of the four fields of a model being edited, by the rate's name: Input, Output, Cache read or Cache write. */
export const fieldOf = (
    price: Pick<Price, 'provider' | 'model'>,
    rate: 'Input' | 'Output' | 'Cache read' | 'Cache write',
) =>
    within(formOf(price)).getByRole('textbox', {
        name: `${rate} rate for ${price.provider} ${price.model}, US dollars per million tokens`,
    })

/** The Edit button of a model. */
export const editButton = (price: Pick<Price, 'provider' | 'model'>) =>
    screen.getByRole('button', {
        name: `Edit the price of ${price.provider} ${price.model}`,
    })

/** Asserts that a model is not being edited, with its Edit button in place. */
export function expectNotEditing(price: Pick<Price, 'provider' | 'model'>) {
    expect(
        screen.queryByRole('form', {
            name: `Edit the price of ${price.provider} ${price.model}`,
        }),
    ).not.toBeInTheDocument()
    expect(editButton(price)).toBeVisible()
}
