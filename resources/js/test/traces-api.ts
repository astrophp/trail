import { act, screen, waitFor, within } from '@testing-library/react'
import { expect, vi } from 'vitest'
import type {
    BookmarkResponse,
    MetaResponse,
    TraceListResponse,
} from '@/api/types'
import { contractFixture } from '@/test/contract-fixture'

/** The list endpoint and the bookmark endpoints, as the traces tests mock them. */
export const traceFixture = contractFixture('traces') as TraceListResponse
export const metaFixture = contractFixture('meta') as MetaResponse
export const bookmarkFixture = contractFixture('bookmark') as BookmarkResponse
const overviewFixture = contractFixture('overview')
const attentionFixture = contractFixture('attention')

export const lastPage = 3

/** Three pages of the fixture's runs, and none past the end; the page is the URL's. */
export function listFor(url: string): TraceListResponse {
    const page = Number(new URL(url, 'http://x').searchParams.get('page') ?? 1)

    return {
        ...traceFixture,
        data: page > lastPage ? [] : traceFixture.data,
        pagination: { page, per_page: 25, total: 60, last_page: lastPage },
    }
}

export const emptyList: TraceListResponse = {
    ...traceFixture,
    data: [],
    pagination: { page: 1, per_page: 25, total: 0, last_page: 1 },
}

export type Handler = (url: string, init?: RequestInit) => Promise<Response>

export const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))

/** A response the test releases by hand. */
export function deferred() {
    let resolve: (response: Response) => void = () => {}
    const promise = new Promise<Response>((done) => {
        resolve = done
    })

    return { promise, resolve }
}

/** The meta answer with some of its fields replaced (`any`, `running`, `recording`). */
export function metaWith({
    any = true,
    recording = 'enabled',
}: {
    any?: boolean
    recording?: MetaResponse['data']['recording']
}): MetaResponse {
    return {
        ...metaFixture,
        data: {
            ...metaFixture.data,
            recording,
            traces: { ...metaFixture.data.traces, any },
        },
    }
}

const isBookmark = (url: string) => /\/api\/traces\/[^?]+\/bookmark$/.test(url)

/**
 * Answers `/meta` with `meta` (by default its fixture), the bookmark endpoints with `bookmark`
 * (by default what the method means) and the list with `respond`.
 */
export function mockApi(
    // Any other page of the dashboard a test visits on the way gets its own fixture.
    respond: Handler = (url) =>
        json(
            url.includes('/api/overview/attention')
                ? attentionFixture
                : url.includes('/api/overview')
                  ? overviewFixture
                  : listFor(url),
        ),
    bookmark: Handler = (url, init) =>
        json({
            data: {
                trace_id: decodeURIComponent(url.split('/').at(-2) ?? ''),
                bookmarked: init?.method === 'PUT',
            },
        }),
    meta: Handler = () => json(metaFixture),
) {
    const fetchMock = vi.fn<Handler>((url, init) =>
        url.includes('/api/meta')
            ? meta(url, init)
            : isBookmark(url)
              ? bookmark(url, init)
              : respond(url, init),
    )
    vi.stubGlobal('fetch', fetchMock)

    return fetchMock
}

type Mock = ReturnType<typeof mockApi>

/** The list requests made so far. */
export const traceUrls = (fetchMock: Mock) =>
    fetchMock.mock.calls
        .map(([url]) => url)
        .filter((url) => url.includes('/api/traces?'))

export const lastTraceUrl = (fetchMock: Mock) => traceUrls(fetchMock).at(-1)

/** The bookmark writes made so far, as `METHOD path`. */
export const bookmarkCalls = (fetchMock: Mock) =>
    fetchMock.mock.calls
        .filter(([url]) => isBookmark(url))
        .map(([url, init]) => `${init?.method} ${url}`)

/** The query parameters of a request. */
export const paramsOf = (url: string | undefined) =>
    Object.fromEntries(new URL(url ?? '', 'http://x').searchParams)

export const expectSearch = (expected: string) =>
    waitFor(() => expect(window.location.search).toBe(expected))

/**
 * Goes Back or Forward one entry and returns once the app has been told. jsdom delivers a
 * traversal later, on a real timer that a fake clock does not drive: the location changes first
 * and `popstate` follows. A test that only polled the URL could therefore move a fake clock on
 * before the app had heard of the change, and a debounce waiting at that moment would fire. Waiting
 * for the event itself makes the order the test's, not the machine's.
 */
export async function travel(direction: 'back' | 'forward') {
    await act(async () => {
        const landed = new Promise<void>((resolve) => {
            window.addEventListener('popstate', () => resolve(), { once: true })
        })

        if (direction === 'back') {
            window.history.back()
        } else {
            window.history.forward()
        }

        await landed
    })
}

/** The rows are in: the footer only exists once the answer has arrived. */
export async function loaded() {
    await screen.findByRole('navigation', { name: 'Pagination' })
}

export const dataRows = () => screen.getAllByRole('row').slice(1)
export const tab = (name: RegExp | string) => screen.getByRole('tab', { name })
export const searchBox = () =>
    screen.getByRole('searchbox', { name: 'Search runs' })
export const agentSelect = () =>
    screen.getByRole('combobox', { name: 'Filter by agent' })
export const providerSelect = () =>
    screen.getByRole('combobox', { name: 'Filter by provider' })
export const bookmarkedToggle = () =>
    screen.getByRole('button', { name: 'Bookmarked' })
export const chips = () =>
    within(screen.getByRole('list', { name: 'Active filters' }))
export const noChips = () =>
    expect(
        screen.queryByRole('list', { name: 'Active filters' }),
    ).not.toBeInTheDocument()

/**
 * A server that keeps bookmarks: the list answers with the state of the writes, so a test sees
 * what a refetch brings back. `bookmarked=1` narrows the list as the API does; one page.
 */
export function bookmarkServer(initial: string[] = []) {
    const marked = new Set(initial)

    return {
        marked,
        list(url: string) {
            const only = paramsOf(url).bookmarked === '1'
            const data = traceFixture.data
                .map((trace) => ({
                    ...trace,
                    bookmarked: marked.has(trace.id),
                }))
                .filter((trace) => !only || trace.bookmarked)

            return json({
                ...traceFixture,
                data,
                pagination: {
                    page: 1,
                    per_page: 25,
                    total: data.length,
                    last_page: 1,
                },
            })
        },
        write(url: string, init?: RequestInit) {
            const id = decodeURIComponent(url.split('/').at(-2) ?? '')

            if (init?.method === 'PUT') {
                marked.add(id)
            } else {
                marked.delete(id)
            }

            return json({
                data: { trace_id: id, bookmarked: init?.method === 'PUT' },
            })
        },
    }
}
