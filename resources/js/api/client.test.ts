import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '@/api/client'

// The boot object is read on the first request and kept, so it is set up once here.
window.Trail = { path: '/trail', apiPath: '/trail/api', csrfToken: 'csrf-1' }

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve(json({ data: 'ok' })))
    vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]

    return { url, init, headers: init.headers as Record<string, string> }
}

const failure = async (request: Promise<unknown>) => {
    try {
        await request
    } catch (error) {
        return error
    }

    throw new Error('The request did not fail.')
}

describe('apiRequest', () => {
    it('returns the parsed body', async () => {
        await expect(apiRequest<{ data: string }>('/meta')).resolves.toEqual({
            data: 'ok',
        })

        const { url, init, headers } = lastCall()
        expect(url).toBe('/trail/api/meta')
        expect(init.method).toBe('GET')
        expect(init.credentials).toBe('same-origin')
        expect(headers.Accept).toBe('application/json')
    })

    it('serialises params, leaving out what is empty or false', async () => {
        await apiRequest('/traces', {
            params: {
                range: '24h',
                page: 2,
                slow: true,
                bookmarked: false,
                search: '',
                agent: null,
                model: undefined,
                zero: 0,
            },
        })

        expect(lastCall().url).toBe(
            '/trail/api/traces?range=24h&page=2&slow=1&zero=0',
        )
    })

    it('sends no query string without params', async () => {
        await apiRequest('/meta', { params: { range: undefined } })

        expect(lastCall().url).toBe('/trail/api/meta')
    })

    it('sends the CSRF token and a JSON body on writes, and not on reads', async () => {
        await apiRequest('/traces/a/bookmark', {
            method: 'PUT',
            body: { on: true },
        })

        expect(lastCall().headers).toMatchObject({
            'X-CSRF-TOKEN': 'csrf-1',
            'Content-Type': 'application/json',
        })
        expect(lastCall().init.body).toBe('{"on":true}')

        await apiRequest('/traces/a/bookmark', { method: 'DELETE' })

        expect(lastCall().headers['X-CSRF-TOKEN']).toBe('csrf-1')
        expect(lastCall().headers['Content-Type']).toBeUndefined()

        await apiRequest('/meta')

        expect(lastCall().headers['X-CSRF-TOKEN']).toBeUndefined()
        expect(lastCall().headers['Content-Type']).toBeUndefined()
    })

    it('throws the API message and status for an error answer', async () => {
        fetchMock.mockResolvedValue(json({ message: 'Forbidden.' }, 403))

        const error = await failure(apiRequest('/meta'))

        expect(error).toBeInstanceOf(ApiError)
        expect(error).toMatchObject({
            message: 'Forbidden.',
            status: 403,
            errors: null,
        })
    })

    it('keeps the field errors of a 422', async () => {
        const errors = { range: ['The range must be 1h, 24h or 7d.'] }
        fetchMock.mockResolvedValue(
            json({ message: 'The range must be 1h, 24h or 7d.', errors }, 422),
        )

        expect(await failure(apiRequest('/meta'))).toMatchObject({
            status: 422,
            errors,
        })
    })

    it('words an error without a JSON body itself', async () => {
        fetchMock.mockResolvedValue(
            new Response('<h1>Oops</h1>', { status: 500 }),
        )

        const error = await failure(apiRequest('/meta'))

        expect(error).toBeInstanceOf(ApiError)
        expect(error).toMatchObject({
            message: 'The request failed (500).',
            status: 500,
        })
    })

    it('has no status when the network failed', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

        const error = await failure(apiRequest('/meta'))

        expect(error).toBeInstanceOf(ApiError)
        expect(error).toMatchObject({ status: null, errors: null })
    })

    it.each([
        ['204', new Response(null, { status: 204 })],
        ['205', new Response(null, { status: 205 })],
        ['an empty 200', new Response('', { status: 200 })],
    ])('treats %s as a success without a body', async (_name, response) => {
        fetchMock.mockResolvedValue(response)

        await expect(
            apiRequest<void>('/traces/a/bookmark', { method: 'DELETE' }),
        ).resolves.toBeUndefined()
    })

    it('refuses a success body that is not JSON', async () => {
        fetchMock.mockResolvedValue(
            new Response('<html></html>', { status: 200 }),
        )

        const error = await failure(apiRequest('/meta'))

        expect(error).toBeInstanceOf(ApiError)
        expect((error as ApiError).status).toBe(200)
    })

    it('rethrows an abort as it is', async () => {
        const controller = new AbortController()
        controller.abort()
        fetchMock.mockRejectedValue(controller.signal.reason)

        const error = await failure(
            apiRequest('/meta', { signal: controller.signal }),
        )

        expect(error).not.toBeInstanceOf(ApiError)
        expect((error as DOMException).name).toBe('AbortError')
    })
})
