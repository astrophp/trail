import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MetaResponse } from '@/api/types'
import { contractFixture } from '@/test/contract-fixture'
import { renderApp, testQueryClient } from '@/test/render-app'

const fixture = contractFixture('meta') as MetaResponse

const withRunning = (running: number): MetaResponse => ({
    ...fixture,
    data: {
        ...fixture.data,
        traces: { any: true, running },
    },
})

const tracesLink = () => screen.getByRole('link', { name: /^Traces/ })
const tracesItem = () => tracesLink().closest('li')!

const answering = (body: BodyInit, status = 200) =>
    vi.fn(() => Promise.resolve(new Response(body, { status })))

/** Renders the app and waits until the meta request has been answered and the query has settled. */
async function renderSettled(fetchMock: ReturnType<typeof answering>) {
    const client = testQueryClient()
    vi.stubGlobal('fetch', fetchMock)
    renderApp('/', {}, client)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await waitFor(() => expect(client.isFetching()).toBe(0))
}

describe('runs in flight beside Traces', () => {
    it('shows the count, and describes the Traces link with it', async () => {
        vi.stubGlobal('fetch', answering(JSON.stringify(withRunning(3))))
        renderApp('/', {}, testQueryClient())

        expect(
            await within(tracesItem()).findByText('3 runs in flight'),
        ).toBeInTheDocument()
        expect(tracesLink()).toHaveAccessibleDescription('3 runs in flight')
    })

    it('says "1 run" for one', async () => {
        vi.stubGlobal('fetch', answering(JSON.stringify(withRunning(1))))
        renderApp('/', {}, testQueryClient())

        expect(
            await within(tracesItem()).findByText('1 run in flight'),
        ).toBeInTheDocument()
    })

    it('shows nothing for none', async () => {
        await renderSettled(answering(JSON.stringify(withRunning(0))))

        expect(within(tracesItem()).queryByText(/in flight/)).toBeNull()
        expect(tracesLink()).not.toHaveAttribute('aria-describedby')
    })

    it('shows nothing while loading', () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => new Promise<Response>(() => {})),
        )
        renderApp('/')

        expect(within(tracesItem()).queryByText(/in flight/)).toBeNull()
    })

    it('shows nothing when the request fails', async () => {
        await renderSettled(answering('{"message":"Forbidden."}', 403))

        expect(within(tracesItem()).queryByText(/in flight/)).toBeNull()
        expect(tracesLink()).not.toHaveAttribute('aria-describedby')
    })
})
