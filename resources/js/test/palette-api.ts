import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { Agent, SearchResponse, Trace } from '@/api/types'
import { contractFixture } from '@/test/contract-fixture'
import { agentsFor } from '@/test/agents-api'
import { listFor as conversationsFor } from '@/test/conversations-api'
import { json, listFor, mockApi, type Handler } from '@/test/traces-api'
import { breakdownFor, quietUsageFor, spendFor } from '@/test/usage-api'

export { deferred, json, type Handler } from '@/test/traces-api'

/** The answer the contract test froze: two runs, a conversation and an agent for the text `order`. */
export const searchFixture = contractFixture('search') as SearchResponse

/** The first run, conversation and agent of the fixture, to copy from. */
export const [fixtureRun, otherRun] = searchFixture.data.traces
export const [fixtureConversation] = searchFixture.data.conversations
export const [fixtureAgent] = searchFixture.data.agents

/** A search answer for `q`, with some of its parts replaced. */
export function searchFor(
    q: string,
    parts: {
        traces?: Trace[]
        conversations?: SearchResponse['data']['conversations']
        agents?: Agent[]
        truncated?: Partial<
            Record<'traces' | 'conversations' | 'agents', boolean>
        >
        preset?: SearchResponse['range']['preset']
    } = {},
): SearchResponse {
    const { truncated = {}, preset = '24h' } = parts

    return {
        data: {
            traces: parts.traces ?? [],
            conversations: parts.conversations ?? [],
            agents: parts.agents ?? [],
        },
        query: { q, minimum: 2, searched: true },
        limits: {
            traces: { limit: 5, truncated: truncated.traces ?? false },
            conversations: {
                limit: 5,
                truncated: truncated.conversations ?? false,
            },
            agents: { limit: 5, truncated: truncated.agents ?? false },
        },
        range: { ...searchFixture.range, preset },
    }
}

/** A run of the fixture with some of its fields replaced. */
export const runWith = (patch: Partial<Trace>): Trace => ({
    ...fixtureRun,
    ...patch,
})

/** An agent of the fixture with some of its fields replaced. */
export const agentWith = (patch: Partial<Agent>): Agent => ({
    ...fixtureAgent,
    ...patch,
})

/** The text a request asked the search for. */
export const searched = (url: string) =>
    new URL(url, 'http://x').searchParams.get('q')

/** The lists the pages of the dashboard ask for, as their own tests answer them; the overview gets its default. */
const otherPages: Handler = (url) =>
    url.includes('/api/overview')
        ? json(
              contractFixture(
                  url.includes('attention') ? 'attention' : 'overview',
              ),
          )
        : url.includes('/api/conversations')
          ? json(conversationsFor(url))
          : url.includes('/api/agents')
            ? json(agentsFor(url))
            : url.includes('/api/usage/breakdown')
              ? json(breakdownFor(url))
              : url.includes('/api/usage/spend')
                ? json(spendFor(url))
                : url.includes('/api/usage')
                  ? json(quietUsageFor(url))
                  : url.includes('/api/prices')
                    ? json(contractFixture('prices'))
                    : json(listFor(url))

/**
 * Answers the search with `respond` and every other request of the pages a test visits (the list of
 * runs, by default) as the other tests do. The returned mock has the search requests in `searches`.
 */
export function mockSearch(respond: Handler, rest: Handler = otherPages) {
    const fetchMock = mockApi((url, init) =>
        url.includes('/api/search') ? respond(url, init) : rest(url, init),
    )

    return Object.assign(fetchMock, {
        searches: () =>
            fetchMock.mock.calls.filter(([url]) => url.includes('/api/search')),
    })
}

/** The palette's dialog. */
export const palette = () => screen.getByRole('dialog', { name: 'Search' })
export const queryPalette = () =>
    screen.queryByRole('dialog', { name: 'Search' })

/** The palette's search row. */
export const searchRow = () =>
    within(palette()).getByRole('combobox', {
        name: 'Search runs, conversations and agents',
    })

/** The options in the palette, by their accessible names. */
export const optionNames = () =>
    within(palette())
        .queryAllByRole('option')
        .map((option) => option.textContent)

/** The status line of the palette: what the search is doing, in words. */
export const status = () => within(palette()).getByRole('status')

/** The key chord that opens the palette on the platform the tests run on (not Apple). */
export const chord = '{Control>}k{/Control}'

/** A `userEvent` that drives the fake clock the debounce runs on. */
export const clock = () =>
    userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

/** Moves the fake clock on, and lets what that started finish. */
export const advance = (ms: number) =>
    act(() => vi.advanceTimersByTimeAsync(ms))
