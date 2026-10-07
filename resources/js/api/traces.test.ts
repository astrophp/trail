import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bookmarkTrace, fetchTraces, unbookmarkTrace } from '@/api/traces'
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
