import { screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import type { Agent, AgentListResponse } from '@/api/types'
import { contractFixture } from '@/test/contract-fixture'
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

/** The list the contract test froze: a pending and partly unpriced agent, one that delegates, an embedding agent and a sub-agent only. */
export const agentFixture = contractFixture('agents') as AgentListResponse

/** An agent of the fixture, by its name. */
export function agentNamed(name: string): Agent {
    const found = agentFixture.data.find((agent) => agent.name === name)

    if (found === undefined) {
        throw new Error(`The fixture has no agent ${name}.`)
    }

    return found
}

/** A copy of an agent with some of its fields replaced. */
export function agentWith(name: string, patch: Partial<Agent>): Agent {
    return { ...agentNamed(name), ...patch }
}

/** The answer for `data`, with the totals of a single page unless told otherwise. */
export function listOf(
    data: Agent[],
    {
        page = 1,
        total = data.length,
        perPage = 25,
        truncated = false,
        preset = '24h',
    }: {
        page?: number
        total?: number
        perPage?: number
        truncated?: boolean
        preset?: AgentListResponse['range']['preset']
    } = {},
): AgentListResponse {
    return {
        ...agentFixture,
        data,
        range: { ...agentFixture.range, preset },
        pagination: {
            page,
            per_page: perPage,
            total,
            last_page: Math.max(Math.ceil(total / perPage), 1),
        },
        agent_limit: { ...agentFixture.agent_limit, truncated },
    }
}

/** The fixture as the request asked for it: its range's preset and page, and as many rows as `per_page` allows. */
export function agentsFor(url: string): AgentListResponse {
    const query = new URL(url, 'http://x').searchParams
    const perPage = Number(query.get('per_page') ?? 25)

    return listOf(agentFixture.data.slice(0, perPage), {
        page: Number(query.get('page') ?? 1),
        total: agentFixture.data.length,
        perPage,
        preset: (query.get('range') ??
            '24h') as AgentListResponse['range']['preset'],
    })
}

export const emptyAgents = listOf([])

/** Answers `/meta` with its fixture, and everything else the pages ask for with `respond`. */
export function mockApi(
    respond: Handler = (url) => json(agentsFor(url)),
    meta: Handler = () => json(metaFixture),
) {
    const fetchMock = vi.fn<Handler>((url, init) =>
        url.includes('/api/meta') ? meta(url, init) : respond(url, init),
    )
    vi.stubGlobal('fetch', fetchMock)

    return fetchMock
}

/** From now on the list endpoint answers with `respond`. */
export function answerWith(
    fetchMock: ReturnType<typeof mockApi>,
    respond: Handler,
) {
    fetchMock.mockImplementation((url, init) =>
        url.includes('/api/meta') ? json(metaFixture) : respond(url, init),
    )
}

/** The list requests made so far. */
export const agentUrls = (fetchMock: ReturnType<typeof mockApi>) =>
    fetchMock.mock.calls
        .map(([url]) => url)
        .filter((url) => url.includes('/api/agents'))

export const lastAgentUrl = (fetchMock: ReturnType<typeof mockApi>) =>
    agentUrls(fetchMock).at(-1)

/** The rows are in: the footer only exists once the answer has arrived. */
export async function loaded() {
    await screen.findByRole('navigation', { name: 'Pagination' })
}

export const dataRows = () => screen.getAllByRole('row').slice(1)
export const searchBox = () =>
    screen.getByRole('searchbox', { name: 'Search agents' })
export const header = (name: RegExp | string) =>
    screen.getByRole('columnheader', { name })
export const sortButton = (name: RegExp | string) =>
    within(header(name)).getByRole('button')

/** The row of an agent, found by the link that carries its name. */
export function rowOf(name: string): HTMLElement {
    const found = screen.getByRole('link', { name }).closest('tr')

    if (!(found instanceof HTMLElement)) {
        throw new Error(`No row for the agent ${name}.`)
    }

    return found
}

/**
 * The cell of a row under a column, by the column's header text. The row header (the agent) is a
 * `th`, so the cells are counted from the whole row.
 */
export function cellOf(row: HTMLElement, column: string): HTMLElement {
    const table = row.closest('table')
    const heads = [...(table?.querySelectorAll('thead th') ?? [])]
    const index = heads.findIndex((head) => head.textContent === column)
    const cell = row.children[index]

    if (index < 0 || !(cell instanceof HTMLElement)) {
        throw new Error(`No ${column} cell in the row.`)
    }

    return cell
}
