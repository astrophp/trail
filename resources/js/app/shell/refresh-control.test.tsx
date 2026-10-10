import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deferred, json, metaFixture, mockApi } from '@/test/traces-api'
import { RefreshControl } from '@/app/shell/refresh-control'
import { appReady, renderApp, testQueryClient } from '@/test/render-app'

afterEach(() => {
    vi.useRealTimers()
})

const refresh = () => screen.getByRole('button', { name: 'Refresh' })
const metaCalls = (fetchMock: ReturnType<typeof mockApi>) =>
    fetchMock.mock.calls.filter(([url]) => url.includes('/api/meta')).length

describe('refresh', () => {
    it('is one button with one accessible name, and does not announce', async () => {
        mockApi()
        renderApp('/agents')
        await appReady()

        expect(screen.getAllByRole('button', { name: 'Refresh' })).toHaveLength(
            1,
        )
        expect(refresh()).not.toHaveAttribute('aria-live')
        expect(refresh().closest('[aria-live]')).toBeNull()
        expect(
            screen.getByRole('banner').querySelectorAll('[aria-live]'),
        ).toHaveLength(0)

        const updated = await screen.findByText(/^Updated /)

        expect(updated.closest('[aria-live]')).toBeNull()
        expect(updated.closest('[role="status"]')).toBeNull()
    })

    it('fetches the active queries again', async () => {
        const fetchMock = mockApi()
        renderApp('/agents')
        await appReady()
        const before = metaCalls(fetchMock)

        await userEvent.click(refresh())

        await waitFor(() => expect(metaCalls(fetchMock)).toBe(before + 1))
    })

    it('fetches the list of the page it is on again', async () => {
        const fetchMock = mockApi()
        renderApp('/traces')
        await screen.findByRole('navigation', { name: 'Pagination' })
        const lists = () =>
            fetchMock.mock.calls.filter(([url]) => url.includes('/api/traces?'))
                .length
        const before = lists()

        await userEvent.click(refresh())

        await waitFor(() => expect(lists()).toBe(before + 1))
    })

    it('is busy from the press until it has settled', async () => {
        const second = deferred()
        let calls = 0
        mockApi(undefined, undefined, () => {
            calls++

            return calls === 1 ? json(metaFixture) : second.promise
        })
        renderApp('/agents')
        await appReady()
        expect(refresh()).not.toHaveAttribute('aria-busy')

        await userEvent.click(refresh())

        expect(refresh()).toHaveAttribute('aria-busy', 'true')
        expect(refresh().querySelector('svg')).toHaveClass(
            'motion-safe:animate-spin',
        )

        act(() => {
            second.resolve(new Response(JSON.stringify(metaFixture)))
        })

        await waitFor(() => expect(refresh()).not.toHaveAttribute('aria-busy'))
        expect(refresh().querySelector('svg')).not.toHaveClass(
            'motion-safe:animate-spin',
        )
    })

    it('is not busy for a refresh in the background, such as the meta poll', async () => {
        const second = deferred()
        let calls = 0
        mockApi(undefined, undefined, () => {
            calls++

            return calls === 1 ? json(metaFixture) : second.promise
        })
        const client = testQueryClient()
        renderApp('/agents', {}, client)
        await appReady()

        void client.invalidateQueries({ queryKey: ['meta'] })
        await waitFor(() => expect(client.isFetching()).toBe(1))

        expect(refresh()).not.toHaveAttribute('aria-busy')
        expect(refresh().querySelector('svg')).not.toHaveClass(
            'motion-safe:animate-spin',
        )

        act(() => {
            second.resolve(new Response(JSON.stringify(metaFixture)))
        })
        await waitFor(() => expect(client.isFetching()).toBe(0))
    })

    it('says when the data was last updated, and moves forward as time passes', async () => {
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
        const client = testQueryClient()
        // Data from five minutes ago whose refresh never answers, so its age is what is shown.
        client.setQueryData(['meta', '24h'], metaFixture, {
            updatedAt: Date.now() - 5 * 60_000,
        })
        vi.stubGlobal('fetch', () => new Promise<Response>(() => {}))
        renderApp('/agents', {}, client)

        const updated = await screen.findByText('Updated 5m ago')

        expect(updated.tagName).toBe('TIME')
        // The exact time, in the application's zone, is on hover.
        expect(updated).toHaveAttribute('title', expect.stringMatching(/GMT$/))

        act(() => {
            vi.advanceTimersByTime(60_000)
        })

        expect(screen.getByText('Updated 6m ago')).toBeVisible()

        act(() => {
            vi.advanceTimersByTime(60 * 60_000)
        })

        expect(screen.getByText('Updated 1h ago')).toBeVisible()
    })

    it('moves on every ten seconds, not every second', async () => {
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
        const client = testQueryClient()
        client.setQueryData(['meta', '24h'], metaFixture, {
            updatedAt: Date.now() - 55_000,
        })
        vi.stubGlobal('fetch', () => new Promise<Response>(() => {}))
        renderApp('/agents', {}, client)
        await screen.findByText('Updated 55s ago')

        act(() => {
            vi.advanceTimersByTime(9_999)
        })

        expect(screen.getByText('Updated 55s ago')).toBeVisible()

        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(screen.getByText('Updated 1m ago')).toBeVisible()
    })

    it('describes the oldest data on screen, not the newest', () => {
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
        const client = testQueryClient()
        const now = Date.now()
        client.setQueryData(['old'], 1, { updatedAt: now - 10 * 60_000 })
        client.setQueryData(['new'], 2, { updatedAt: now - 30_000 })

        function Probe({ name }: { name: string }) {
            useQuery({
                queryKey: [name],
                queryFn: () => new Promise<number>(() => {}),
                staleTime: Infinity,
            })

            return null
        }

        function Probes() {
            return (
                <>
                    <Probe name="old" />
                    <Probe name="new" />
                    <RefreshControl />
                </>
            )
        }

        render(
            <QueryClientProvider client={client}>
                <Probes />
            </QueryClientProvider>,
        )

        expect(screen.getByText('Updated 10m ago')).toBeVisible()
    })

    it('shows how long ago a fresh answer was, right after it arrives', async () => {
        mockApi()
        renderApp('/agents')

        expect(
            await screen.findByText(/^Updated (just now|\ds ago)$/),
        ).toBeVisible()
    })

    it('shows no time before there is any data', async () => {
        const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
        vi.stubGlobal('fetch', fetchMock)
        renderApp('/agents')
        await waitFor(() => expect(fetchMock).toHaveBeenCalled())

        expect(screen.queryByText(/^Updated /)).not.toBeInTheDocument()
        expect(refresh()).toBeVisible()
    })
})
