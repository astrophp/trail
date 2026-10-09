import { screen } from '@testing-library/react'
import { vi } from 'vitest'
import type {
    AgentBreakdownResponse,
    AgentResponse,
    Summary,
    TraceListResponse,
} from '@/api/types'
import type { TimeRangePreset } from '@/lib/time-range'
import { contractFixture } from '@/test/contract-fixture'
import {
    json,
    metaFixture,
    traceFixture,
    type Handler,
} from '@/test/traces-api'

export {
    deferred,
    expectSearch,
    json,
    metaFixture,
    paramsOf,
    traceFixture,
    type Handler,
} from '@/test/traces-api'

/** The answer the contract test froze for an agent that has runs of its own, one of them running. */
export const showFixture = contractFixture('agent') as AgentResponse

/** The models and tools the contract test froze for an agent that also runs as a sub-agent. */
export const breakdownFixture = contractFixture(
    'agent-breakdown',
) as AgentBreakdownResponse

const isShow = (url: string) => url.includes('/api/agents/show')
const isBreakdown = (url: string) => url.includes('/api/agents/breakdown')
const isTraces = (url: string) => url.includes('/api/traces?')

/** The query of a request. */
export const queryOf = (url: string) => new URL(url, 'http://x').searchParams

/** The range a request asked for. */
const presetOf = (url: string) =>
    (queryOf(url).get('range') ?? '24h') as TimeRangePreset

/** What `patch` changes in the fixture's one agent. */
export type ShowPatch = {
    agent?: Partial<AgentResponse['data']['agent']>
    summary?: Partial<Summary>
    previous?: Summary | null
    attention?: AgentResponse['data']['attention']
}

/**
 * The agent's answer as the request asked for it: the range's preset, and the name the request
 * carried as the agent's own spelling (and in the filters of what needs attention). With nothing
 * running, so a page that shows it asks for nothing again by itself.
 */
export function showFor(url: string, patch: ShowPatch = {}): AgentResponse {
    const name = queryOf(url).get('name') ?? ''
    const base = showFixture.data
    const own = base.agent.top_level
    const quietRuns = { ...base.summary.runs, completed: 22, running: 0 }

    return {
        ...showFixture,
        range: { ...showFixture.range, preset: presetOf(url) },
        data: {
            ...base,
            agent: {
                ...base.agent,
                name,
                top_level:
                    own === null
                        ? null
                        : { ...own, runs: { ...own.runs, ...quietRuns } },
                ...patch.agent,
            },
            summary: { ...base.summary, runs: quietRuns, ...patch.summary },
            previous:
                patch.previous === undefined ? base.previous : patch.previous,
            attention: (patch.attention ?? base.attention).map((item) => ({
                ...item,
                filters: { ...item.filters, agent: name },
                breakdown: item.breakdown.map((row) => ({
                    ...row,
                    filters: { ...row.filters, agent: name },
                })),
            })),
        },
    }
}

/** Every count of a summary zero or missing, as an agent with no runs of its own has it. */
export const noRunsSummary: Summary = {
    runs: {
        all: 0,
        completed: 0,
        failed: 0,
        incomplete: 0,
        running: 0,
        awaiting_approval: 0,
    },
    error_rate: { rate: null, failed: 0, finished: 0 },
    duration: {
        average_ms: null,
        p95_ms: null,
        measured: 0,
        not_measured: 0,
        p95_minimum: 20,
    },
    usage: {
        state: 'not_reported',
        input_tokens: null,
        output_tokens: null,
        cache_read_tokens: null,
        cache_write_tokens: null,
        reasoning_tokens: null,
        total_tokens: null,
    },
    usage_coverage: { reported: 0, not_reported: 0 },
    cost: { state: 'not_captured', amount: null },
    cost_coverage: { unpriced_runs: 0, runs_without_amount: 0 },
}

/** An agent that only ran as a sub-agent in the range: no run of its own, so none of the figures of one. */
export const subAgentOnly: ShowPatch = {
    agent: {
        top_level: null,
        delegated: {
            all: 2,
            failed: 1,
            incomplete: 0,
            last_activity_at: '2026-01-02T11:00:02.600Z',
        },
        last_activity_at: '2026-01-02T11:00:02.600Z',
        activity: [],
    },
    summary: noRunsSummary,
    previous: null,
    attention: [],
}

/** An agent that was recorded, with nothing in the range. */
export const nothingInRange: ShowPatch = {
    agent: {
        top_level: null,
        delegated: null,
        last_activity_at: null,
        activity: [],
    },
    summary: noRunsSummary,
    previous: null,
    attention: [],
}

/** An agent with runs of its own that was also delegated to. */
export const delegating: ShowPatch = {
    agent: {
        delegated: {
            all: 12,
            failed: 1,
            incomplete: 0,
            last_activity_at: '2026-01-02T11:00:01.100Z',
        },
    },
}

/** The breakdown for the range a request asked for, with `patch` applied to its data. */
export function breakdownFor(
    url: string,
    patch: Partial<AgentBreakdownResponse['data']> = {},
    limits: Partial<AgentBreakdownResponse['limits']> = {},
): AgentBreakdownResponse {
    return {
        ...breakdownFixture,
        range: { ...breakdownFixture.range, preset: presetOf(url) },
        data: { ...breakdownFixture.data, ...patch },
        limits: { ...breakdownFixture.limits, ...limits },
    }
}

/**
 * The recent runs for a request: `per_page` of them at most, or `total` if there are fewer, built
 * from the list fixture's runs with ids of their own (`run-0`, `run-1`…) and the agent's name.
 */
export function recentFor(url: string, total = 37): TraceListResponse {
    const perPage = Number(queryOf(url).get('per_page') ?? 25)
    const agent = queryOf(url).get('agent')
    const runs = traceFixture.data

    return {
        ...traceFixture,
        data: Array.from({ length: Math.min(perPage, total) }, (_, index) => ({
            ...runs[index % runs.length],
            id: `run-${index}`,
            name: agent ?? 'Agent',
        })),
        range: { ...traceFixture.range, preset: presetOf(url) },
        pagination: {
            page: 1,
            per_page: perPage,
            total,
            last_page: Math.max(1, Math.ceil(total / perPage)),
        },
    }
}

type Handlers = {
    show?: Handler
    breakdown?: Handler
    traces?: Handler
    /** Anything else the page asks for. */
    other?: Handler
}

/** Answers `/meta` with its fixture, and the agent's endpoints and the list of runs with the handlers given. */
export function mockApi({ show, breakdown, traces, other }: Handlers = {}) {
    const fetchMock = vi.fn<Handler>((url, init) => {
        if (url.includes('/api/meta')) {
            return json(metaFixture)
        }

        if (isShow(url)) {
            return (show ?? ((target) => json(showFor(target))))(url, init)
        }

        if (isBreakdown(url)) {
            return (breakdown ?? ((target) => json(breakdownFor(target))))(
                url,
                init,
            )
        }

        if (isTraces(url)) {
            return (traces ?? ((target) => json(recentFor(target))))(url, init)
        }

        return (other ?? (() => json({}, 404)))(url, init)
    })

    vi.stubGlobal('fetch', fetchMock)

    return fetchMock
}

type Mock = ReturnType<typeof mockApi>

const calls = (fetchMock: Mock, match: (url: string) => boolean) =>
    fetchMock.mock.calls.map(([url]) => url).filter(match)

/** The requests made so far for the agent, its breakdown and the list of runs. */
export const showUrls = (fetchMock: Mock) => calls(fetchMock, isShow)
export const breakdownUrls = (fetchMock: Mock) => calls(fetchMock, isBreakdown)
export const traceUrls = (fetchMock: Mock) => calls(fetchMock, isTraces)

/** The page's heading once the agent's figures are drawn. */
export const strip = () =>
    document.querySelector<HTMLElement>('[data-slot="metric-strip"]')

/** A panel of the page, by its title. */
export function panel(title: string): HTMLElement {
    const heading = screen.getByRole('heading', { name: title })
    const found = heading.closest('[data-slot="panel"]')

    if (!(found instanceof HTMLElement)) {
        throw new Error(`No panel called ${title}.`)
    }

    return found
}
