import { screen, waitFor, within } from '@testing-library/react'
import { expect, vi } from 'vitest'
import type {
    Summary,
    UsageAgentRow,
    UsageBreakdownResponse,
    UsageModelRow,
    UsageProviderRow,
    UsageResponse,
} from '@/api/types'
import type { TimeRangePreset } from '@/lib/time-range'
import { contractFixture } from '@/test/contract-fixture'
import { runs } from '@/test/overview-api'
import { json, metaFixture, type Handler } from '@/test/traces-api'

export {
    deferred,
    expectSearch,
    json,
    metaFixture,
    paramsOf,
    travel,
    type Handler,
} from '@/test/traces-api'

/** The totals the contract test froze: one run still running, one step that could not be priced. */
export const usageFixture = contractFixture('usage') as UsageResponse

/** The breakdown by model the contract test froze: a pending partly priced model, a priced one, an embeddings one and one that reported nothing. */
export const breakdownFixture = contractFixture('usage-breakdown') as Extract<
    UsageBreakdownResponse,
    { by: 'model' }
>

const range = (preset: TimeRangePreset | null = '24h') => ({
    ...usageFixture.range,
    preset,
})

/** The totals with the summary changed by `patch`, and the coverage by `coverage`. */
export function usageWith(
    patch: Partial<Summary>,
    coverage: Partial<UsageResponse['data']['coverage']> = {},
    preset: TimeRangePreset = '24h',
): UsageResponse {
    return {
        data: {
            summary: { ...usageFixture.data.summary, ...patch },
            coverage: { ...usageFixture.data.coverage, ...coverage },
        },
        range: range(preset),
    }
}

/** The totals once nothing is running: the same figures, final. */
export function quietUsage(preset: TimeRangePreset = '24h'): UsageResponse {
    const { summary } = usageFixture.data

    return usageWith(
        {
            runs: runs({ completed: summary.runs.all }),
            usage: { ...summary.usage, state: 'reported' },
            cost:
                summary.cost.amount === null
                    ? { state: 'not_captured', amount: null }
                    : { state: 'partial', amount: summary.cost.amount },
        },
        {},
        preset,
    )
}

const presetOf = (url: string): TimeRangePreset =>
    (new URL(url, 'http://x').searchParams.get(
        'range',
    ) as TimeRangePreset | null) ?? '24h'

/** The totals as the range asked for would have them, with a run still running. */
export const usageFor = (url: string): UsageResponse => ({
    ...usageFixture,
    range: range(presetOf(url)),
})

/** The totals as the range asked for would have them, with nothing running. */
export const quietUsageFor = (url: string): UsageResponse =>
    quietUsage(presetOf(url))

/** The fixture's models by what they show: pending and partly priced, priced, tokens without an output, and nothing reported. */
export const [sonnet, haiku, embedding, gpt5] = breakdownFixture.data

/** The pending partly priced model once its step has finished: the amount covers only the priced steps. */
export const sonnetSettled: UsageModelRow = {
    ...sonnet,
    usage: { ...sonnet.usage, state: 'reported' },
    cost: { state: 'partial', amount: 0.00825 },
}

/** A model nothing could be priced for, whose unpriced steps reported no count. */
export const unpricedModel: UsageModelRow = {
    ...embedding,
    cost: { state: 'unpriced', amount: null },
    coverage: { reported_steps: 2, unpriced_steps: 2, unpriced_tokens: null },
}

/** A model's figures as an agent's row, named and filtered by the agent. */
export function agentRow(
    agent: string,
    from: UsageModelRow = haiku,
    patch: Partial<UsageAgentRow> = {},
): UsageAgentRow {
    const { provider, model, ...figures } = from

    void provider
    void model

    return { ...figures, agent, filters: { agent }, ...patch }
}

/** A model's figures as a provider's row, named and filtered by the provider. */
export function providerRow(
    provider: string,
    from: UsageModelRow = haiku,
    patch: Partial<UsageProviderRow> = {},
): UsageProviderRow {
    const { model, ...figures } = from

    void model

    return { ...figures, provider, filters: { provider }, ...patch }
}

type Page = {
    page?: number
    total?: number
    perPage?: number
    truncated?: boolean
    preset?: TimeRangePreset
}

/** A page of the breakdown, grouped by `by`, with the totals of a single page unless told otherwise. */
export function breakdownOf(
    by: 'model' | 'agent' | 'provider',
    rows: (UsageModelRow | UsageAgentRow | UsageProviderRow)[],
    {
        page = 1,
        total = rows.length,
        perPage = 25,
        truncated = false,
        preset = '24h',
    }: Page = {},
): UsageBreakdownResponse {
    return {
        ...breakdownFixture,
        by,
        data: rows,
        pagination: {
            page,
            per_page: perPage,
            total,
            last_page: Math.max(Math.ceil(total / perPage), 1),
        },
        row_limit: { ...breakdownFixture.row_limit, truncated },
        range: range(preset),
    } as UsageBreakdownResponse
}

export const modelRows = breakdownFixture.data
export const agentRows = [
    agentRow('SupportAssistant', sonnetSettled),
    agentRow('Research Agent', haiku),
]
export const providerRows = [
    providerRow('anthropic', sonnetSettled),
    providerRow('openai', embedding),
]

/** The breakdown as the request asked for it: the grouping it named, with that grouping's rows. */
export function breakdownFor(url: string): UsageBreakdownResponse {
    const query = new URL(url, 'http://x').searchParams
    const by = query.get('by') ?? 'model'
    const options = {
        page: Number(query.get('page') ?? 1),
        preset: presetOf(url),
    }

    return by === 'agent'
        ? breakdownOf('agent', agentRows, options)
        : by === 'provider'
          ? breakdownOf('provider', providerRows, options)
          : breakdownOf('model', modelRows, options)
}

const isBreakdown = (url: string) => url.includes('/api/usage/breakdown')
const isUsage = (url: string) => url.includes('/api/usage') && !isBreakdown(url)

/**
 * Answers `/meta` with its fixture, `/usage` with `totals` (by default with a run still running)
 * and `/usage/breakdown` with `breakdown`.
 */
export function mockApi(
    totals: Handler = (url) => json(usageFor(url)),
    breakdown: Handler = (url) => json(breakdownFor(url)),
    meta: Handler = () => json(metaFixture),
) {
    const fetchMock = vi.fn<Handler>((url, init) =>
        url.includes('/api/meta')
            ? meta(url, init)
            : isBreakdown(url)
              ? breakdown(url, init)
              : totals(url, init),
    )
    vi.stubGlobal('fetch', fetchMock)

    return fetchMock
}

/** Nothing running: the totals ask for nothing again. */
export const mockQuietApi = (breakdown?: Handler) =>
    mockApi((url) => json(quietUsageFor(url)), breakdown)

/** The totals' requests made so far. */
export const usageUrls = (fetchMock: ReturnType<typeof mockApi>) =>
    fetchMock.mock.calls.map(([url]) => url).filter(isUsage)

/** The breakdown's requests made so far. */
export const breakdownUrls = (fetchMock: ReturnType<typeof mockApi>) =>
    fetchMock.mock.calls.map(([url]) => url).filter(isBreakdown)

export const lastBreakdownUrl = (fetchMock: ReturnType<typeof mockApi>) =>
    breakdownUrls(fetchMock).at(-1)

/** The breakdown's rows are in: the table is there, not loading, and has more than its header. */
export async function rowsLoaded() {
    await waitFor(() => {
        expect(table()).not.toHaveAttribute('aria-busy')
        expect(within(table()).getAllByRole('row').length).toBeGreaterThan(1)
    })
}

export const table = () => screen.getByRole('table', { name: /^Usage by / })
export const dataRows = () => within(table()).getAllByRole('row').slice(1)
export const header = (name: RegExp | string) =>
    within(table()).getByRole('columnheader', { name })
export const sortButton = (name: RegExp | string) =>
    within(header(name)).getByRole('button')
export const tab = (name: RegExp | string) => screen.getByRole('tab', { name })
export const hasColumn = (name: RegExp | string) =>
    within(table()).queryByRole('columnheader', { name }) !== null

/** The row that carries a text, found by it. */
export function rowOf(text: string): HTMLElement {
    const found = within(table())
        .getAllByRole('row')
        .find((row) => row.textContent?.includes(text))

    if (!(found instanceof HTMLElement)) {
        throw new Error(`No row has ${text}.`)
    }

    return found
}

/** The cell of a row under a column, by the column's header text. */
export function cellOf(row: HTMLElement, column: string): HTMLElement {
    const headers = within(table()).getAllByRole('columnheader')
    const index = headers.findIndex((cell) => cell.textContent === column)
    const cell = within(row).getAllByRole('cell')[index - 1]

    if (index < 0 || !(cell instanceof HTMLElement)) {
        throw new Error(`No ${column} cell.`)
    }

    return cell
}
