import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    bookmarkTrace,
    fetchNeighbours,
    fetchTrace,
    fetchTraces,
    traceKeys,
    unbookmarkTrace,
} from '@/api/traces'
import { contractFixture } from '@/test/contract-fixture'

// The boot object is read on the first request and kept, so it is set up once here.
window.Trail = { path: '/trail', apiPath: '/trail/api', csrfToken: 'csrf-1' }

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
    fetchMock = vi.fn(() =>
        Promise.resolve(
            new Response(JSON.stringify(contractFixture('bookmark'))),
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]

    return { url, init, headers: init.headers as Record<string, string> }
}

describe('fetchTrace', () => {
    it('asks for one run by its id, escaped', async () => {
        await fetchTrace('0199c2f4-6a1e')
        expect(lastCall().url).toBe('/trail/api/traces/0199c2f4-6a1e')
        expect(lastCall().init.method).toBe('GET')

        await fetchTrace('a/b c')
        expect(lastCall().url).toBe('/trail/api/traces/a%2Fb%20c')
    })

    it('passes the abort signal on', async () => {
        const controller = new AbortController()

        await fetchTrace('x', controller.signal)

        expect(lastCall().init.signal).toBe(controller.signal)
    })

    it('rejects with the status of a 404', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ message: 'No run.' }), {
                status: 404,
            }),
        )

        await expect(fetchTrace('ghost')).rejects.toMatchObject({
            status: 404,
            message: 'No run.',
        })
    })
})

describe('traceKeys', () => {
    it('nests the lists and the details under one root', () => {
        expect(traceKeys.all).toEqual(['traces'])
        expect(traceKeys.list).toEqual(['traces', 'list'])
        expect(traceKeys.detail('abc')).toEqual(['traces', 'detail', 'abc'])
    })
})

describe('fetchNeighbours', () => {
    it('asks for the neighbours of one run in the view, without the page', async () => {
        await fetchNeighbours('a/b', {
            range: '7d',
            sort: '-cost',
            page: 3,
            status: 'failed',
            search: 'refund',
            bookmarked: true,
        })

        expect(lastCall().url).toBe(
            '/trail/api/traces/a%2Fb/neighbours?range=7d&sort=-cost&status=failed&search=refund&bookmarked=1',
        )
    })

    it('has a key per run and view, whatever the page', () => {
        const view = { range: '7d', sort: '-cost' } as const

        expect(traceKeys.neighbours('abc', { ...view, page: 2 })).toEqual(
            traceKeys.neighbours('abc', { ...view, page: 5 }),
        )
        expect(traceKeys.neighbours('abc', view)).not.toEqual(
            traceKeys.neighbours('abd', view),
        )
        expect(traceKeys.neighbours('abc', view)).not.toEqual(
            traceKeys.neighbours('abc', { ...view, sort: 'cost' }),
        )
    })
})

describe('fetchTraces', () => {
    it('sends the filters that are set, as the API names them, and leaves out the rest', async () => {
        await fetchTraces({
            range: '7d',
            status: 'failed',
            search: 'refund',
            agent: 'SupportAssistant',
            provider: '',
            bookmarked: true,
        })

        expect(lastCall().url).toBe(
            '/trail/api/traces?range=7d&status=failed&search=refund&agent=SupportAssistant&bookmarked=1',
        )
    })

    it('sends the model, the tool and the page size, whatever characters they hold', async () => {
        await fetchTraces({
            range: '24h',
            agent: 'Support/Bot',
            model: 'claude 3+5',
            tool: 'lookup/order 1',
            per_page: 8,
        })

        expect(
            Object.fromEntries(
                new URL(lastCall().url, 'http://x').searchParams,
            ),
        ).toEqual({
            range: '24h',
            agent: 'Support/Bot',
            model: 'claude 3+5',
            tool: 'lookup/order 1',
            per_page: '8',
        })
    })

    it('does not send a switch that is off', async () => {
        await fetchTraces({ range: '24h', bookmarked: false })

        expect(lastCall().url).toBe('/trail/api/traces?range=24h')
    })
})

describe('the bookmark endpoints', () => {
    it('PUT bookmarks and DELETE un-bookmarks, with the CSRF token', async () => {
        await bookmarkTrace('abc')

        expect(lastCall().url).toBe('/trail/api/traces/abc/bookmark')
        expect(lastCall().init.method).toBe('PUT')
        expect(lastCall().headers['X-CSRF-TOKEN']).toBe('csrf-1')

        await unbookmarkTrace('abc')

        expect(lastCall().init.method).toBe('DELETE')
        expect(lastCall().headers['X-CSRF-TOKEN']).toBe('csrf-1')
    })

    it('encodes the id in the path', async () => {
        await bookmarkTrace('a/b c?d')
        expect(lastCall().url).toBe('/trail/api/traces/a%2Fb%20c%3Fd/bookmark')

        await unbookmarkTrace('a/b c?d')
        expect(lastCall().url).toBe('/trail/api/traces/a%2Fb%20c%3Fd/bookmark')
    })

    it('answers with the bookmark state', async () => {
        await expect(bookmarkTrace('abc')).resolves.toEqual(
            contractFixture('bookmark'),
        )
    })
})
