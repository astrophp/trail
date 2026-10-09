import { screen, waitFor, within } from '@testing-library/react'
import { expect, vi } from 'vitest'
import type { Summary } from '@/api/types'
import type {
    Cost,
    Usage,
    UsageAgentRow,
    UsageBreakdownResponse,
    UsageBreakdownRow,
    UsageModelRow,
    UsageProviderRow,
    UsageResponse,
    UsageRowCoverage,
} from '@/api/types'
import type { UsageGrouping } from '@/api/usage'
import type { TimeRangePreset } from '@/lib/time-range'
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

const range = (preset: TimeRangePreset | null = '24h') => ({
    preset,
    from: '2026-01-01T12:00:00.000Z',
    to: '2026-01-02T12:00:00.000Z',
})

/** The summary of a busy range: two runs are still running, so its usage and cost are pending. */
const summaryFixture: Summary = {
    runs: runs({
        completed: 37,
        failed: 9,
        incomplete: 3,
        running: 2,
        awaiting_approval: 1,
    }),
    error_rate: { rate: 0.1836734694, failed: 9, finished: 49 },
    duration: {
        average_ms: 1840.412,
        p95_ms: 9200,
        measured: 49,
        not_measured: 3,
        p95_minimum: 20,
    },
    usage: {
        state: 'pending',
        input_tokens: 7_280_000,
        output_tokens: 621_600,
        cache_read_tokens: 430_200,
        cache_write_tokens: null,
        reasoning_tokens: null,
        total_tokens: 7_901_600,
    },
    usage_coverage: { reported: 48, not_reported: 4 },
    cost: { state: 'pending', amount: 11.48 },
    cost_coverage: { unpriced_runs: 8, runs_without_amount: 5 },
}

/** The totals of a busy range: runs running, 8 runs with 11 steps that had no rate. */
export const usageFixture: UsageResponse = {
    data: {
        summary: summaryFixture,
        coverage: {
            steps: 1310,
            reported_steps: 1290,
            unpriced_steps: 11,
            unpriced_tokens: 24_800,
        },
    },
    range: range(),
}

/** The totals with the summary changed by `patch`, and the coverage by `coverage`. */
export function usageWith(
    patch: Partial<Summary>,
    coverage: Partial<UsageResponse['data']['coverage']> = {},
    preset: TimeRangePreset = '24h',
): UsageResponse {
    return {
        data: {
            summary: { ...summaryFixture, ...patch },
            coverage: { ...usageFixture.data.coverage, ...coverage },
        },
        range: range(preset),
    }
}

/** The totals once nothing is running: the same figures, final. */
export function quietUsage(preset: TimeRangePreset = '24h'): UsageResponse {
    return usageWith(
        {
            runs: runs({ completed: 40, failed: 9, incomplete: 3 }),
            usage: { ...summaryFixture.usage, state: 'reported' },
            cost: { state: 'partial', amount: 11.48 },
        },
        {},
        preset,
    )
}

/** The totals as the range asked for would have them, with a run still running. */
export function usageFor(url: string): UsageResponse {
    return {
        ...usageFixture,
        range: range(
            (new URL(url, 'http://x').searchParams.get(
                'range',
            ) as TimeRangePreset | null) ?? '24h',
        ),
    }
}

/** The totals as the range asked for would have them, with nothing running. */
export function quietUsageFor(url: string): UsageResponse {
    return quietUsage(
        (new URL(url, 'http://x').searchParams.get(
            'range',
        ) as TimeRangePreset | null) ?? '24h',
    )
}

const priced: UsageRowCoverage = {
    reported_steps: 300,
    unpriced_steps: 0,
    unpriced_tokens: 0,
}

const usageOf = (patch: Partial<Usage> = {}): Usage => ({
    state: 'reported',
    input_tokens: 1000,
    output_tokens: 200,
    cache_read_tokens: null,
    cache_write_tokens: null,
    reasoning_tokens: null,
    total_tokens: 1200,
    ...patch,
})

/** A model row: priced in full, with no cache or reasoning counts, unless `patch` says otherwise. */
export function modelRow(
    provider: string,
    model: string,
    patch: Partial<UsageModelRow> = {},
): UsageModelRow {
    return {
        provider,
        model,
        steps: 300,
        runs: 120,
        usage: usageOf(),
        cost: { state: 'estimated', amount: 2.5 },
        coverage: priced,
        filters: { provider, model },
        ...patch,
    }
}

export function agentRow(
    agent: string,
    patch: Partial<UsageAgentRow> = {},
): UsageAgentRow {
    return {
        agent,
        steps: 40,
        runs: 20,
        usage: usageOf(),
        cost: { state: 'estimated', amount: 0.75 },
        coverage: { ...priced, reported_steps: 40 },
        filters: { agent },
        ...patch,
    }
}

export function providerRow(
    provider: string,
    patch: Partial<UsageProviderRow> = {},
): UsageProviderRow {
    return {
        provider,
        steps: 500,
        runs: 150,
        usage: usageOf(),
        cost: { state: 'estimated', amount: 3.1 },
        coverage: { ...priced, reported_steps: 500 },
        filters: { provider },
        ...patch,
    }
}

/** Reported in part: some steps of the model could not be priced, and the amount covers the rest. */
export const partlyPriced: Partial<UsageModelRow> = {
    cost: { state: 'partial', amount: 3.7603 },
    usage: usageOf({
        input_tokens: 650_500,
        output_tokens: 136_500,
        cache_read_tokens: 90_000,
        total_tokens: 787_000,
    }),
    coverage: { reported_steps: 300, unpriced_steps: 4, unpriced_tokens: 9100 },
}

/** Nothing could be priced, and the unpriced steps reported no count. */
export const unpriced: Partial<UsageModelRow> = {
    cost: { state: 'unpriced', amount: null },
    coverage: { reported_steps: 12, unpriced_steps: 12, unpriced_tokens: null },
}

export const claude = modelRow('anthropic', 'claude-sonnet-4-5', {
    ...partlyPriced,
    runs: 120,
    steps: 310,
})
export const gpt = modelRow('openai', 'gpt-4.1', {
    runs: 60,
    steps: 90,
    cost: { state: 'estimated', amount: 1.25 },
})
export const llama = modelRow('ollama', 'llama-3.3', {
    ...unpriced,
    runs: 5,
    steps: 12,
})

type Page = {
    page?: number
    total?: number
    perPage?: number
    truncated?: boolean
    preset?: TimeRangePreset
}

/** A page of the breakdown: the rows, grouped by what the rows are, with the totals of a single page unless told otherwise. */
export function breakdownOf(
    by: 'model',
    rows: UsageModelRow[],
    page?: Page,
): UsageBreakdownResponse
export function breakdownOf(
    by: 'agent',
    rows: UsageAgentRow[],
    page?: Page,
): UsageBreakdownResponse
export function breakdownOf(
    by: 'provider',
    rows: UsageProviderRow[],
    page?: Page,
): UsageBreakdownResponse
export function breakdownOf(
    by: UsageGrouping,
    rows: UsageBreakdownRow[],
    {
        page = 1,
        total = rows.length,
        perPage = 25,
        truncated = false,
        preset = '24h',
    }: Page = {},
): UsageBreakdownResponse {
    return {
        by,
        data: rows,
        pagination: {
            page,
            per_page: perPage,
            total,
            last_page: Math.max(Math.ceil(total / perPage), 1),
        },
        row_limit: { limit: 1000, truncated },
        range: range(preset),
    } as UsageBreakdownResponse
}

export const modelRows = [claude, gpt, llama]
export const agentRows = [
    agentRow('SupportAssistant'),
    agentRow('Research Agent', { cost: partlyPriced.cost as Cost }),
]
export const providerRows = [
    providerRow('anthropic'),
    providerRow('openai'),
    providerRow('ollama', {
        cost: { state: 'unpriced', amount: null },
    }),
]

/** The breakdown as the request asked for it: the grouping it named, with that grouping's rows. */
export function breakdownFor(url: string): UsageBreakdownResponse {
    const query = new URL(url, 'http://x').searchParams
    const by = query.get('by') ?? 'model'
    const options = {
        page: Number(query.get('page') ?? 1),
        preset: (query.get('range') ?? '24h') as TimeRangePreset,
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
