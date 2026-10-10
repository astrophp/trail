import { screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import type { Conversation, ConversationListResponse } from '@/api/types'
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

/** The list the contract test froze: a pending, a partly priced, a shared and a bare conversation. */
export const conversationFixture = contractFixture(
    'conversations',
) as ConversationListResponse

export const lastPage = 3

/** A row of the fixture, by its id. */
export function row(id: string): Conversation {
    const found = conversationFixture.data.find((c) => c.id === id)

    if (found === undefined) {
        throw new Error(`The fixture has no conversation ${id}.`)
    }

    return found
}

/** A page of conversations in the shape of the API's answer, with the counts and the totals it states. */
export function listOf(
    data: Conversation[],
    {
        page = 1,
        total = data.length,
        counts = { all: total, failed: 1 },
    }: {
        page?: number
        total?: number
        counts?: { all: number; failed: number }
    } = {},
): ConversationListResponse {
    return {
        ...conversationFixture,
        data,
        pagination: {
            page,
            per_page: 25,
            total,
            last_page: Math.max(Math.ceil(total / 25), 1),
        },
        counts,
    }
}

/** Three pages of the fixture's rows, and none past the end; the page is the URL's. */
export function listFor(url: string): ConversationListResponse {
    const page = Number(new URL(url, 'http://x').searchParams.get('page') ?? 1)

    return {
        ...conversationFixture,
        data: page > lastPage ? [] : conversationFixture.data,
        pagination: { page, per_page: 25, total: 60, last_page: lastPage },
        counts: { all: 60, failed: 7 },
    }
}

export const emptyList = listOf([], { counts: { all: 0, failed: 0 } })

/** Answers `/meta` with its fixture and the list with `respond`. */
export function mockApi(
    respond: Handler = (url) => json(listFor(url)),
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
export const conversationUrls = (fetchMock: ReturnType<typeof mockApi>) =>
    fetchMock.mock.calls
        .map(([url]) => url)
        .filter((url) => url.includes('/api/conversations'))

export const lastConversationUrl = (fetchMock: ReturnType<typeof mockApi>) =>
    conversationUrls(fetchMock).at(-1)

/** The rows are in: the footer only exists once the answer has arrived. */
export async function loaded() {
    await screen.findByRole('navigation', { name: 'Pagination' })
}

export const dataRows = () => screen.getAllByRole('row').slice(1)
export const tab = (name: RegExp | string) => screen.getByRole('tab', { name })
export const searchBox = () =>
    screen.getByRole('searchbox', { name: 'Search conversations' })
export const agentSelect = () =>
    screen.getByRole('combobox', { name: 'Filter by agent' })
export const header = (name: RegExp | string) =>
    screen.getByRole('columnheader', { name })
export const sortButton = (name: RegExp | string) =>
    within(header(name)).getByRole('button')
export const chips = () =>
    within(screen.getByRole('list', { name: 'Active filters' }))

/** The muted line of a conversation's first cell: its id, then its agents. */
export function lineOf(id: string): HTMLElement {
    const line = [...document.querySelectorAll('tbody p[title]')].find((p) => {
        const title = p.getAttribute('title')

        return title === id || title?.startsWith(`${id} · `)
    })

    if (!(line instanceof HTMLElement)) {
        throw new Error(`No line for the conversation ${id}.`)
    }

    return line
}

/** The row of a conversation, found by its id on the second line of its first cell. */
export function rowOf(id: string): HTMLElement {
    const found = lineOf(id).closest('tr')

    if (!(found instanceof HTMLElement)) {
        throw new Error(`No row for the conversation ${id}.`)
    }

    return found
}

/** The text of each cell of a conversation's row, in column order. */
export const cellsOf = (id: string) =>
    within(rowOf(id))
        .getAllByRole('cell')
        .map((cell) => cell.textContent ?? '')
