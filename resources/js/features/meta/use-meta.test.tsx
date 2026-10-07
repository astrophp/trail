import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useNavigate } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { MetaResponse } from '@/api/types'
import { useMeta } from '@/features/meta'
import { contractFixture } from '@/test/contract-fixture'
import { testQueryClient } from '@/test/render-app'

const response = contractFixture('meta') as MetaResponse

function setup(url: string) {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(() =>
        Promise.resolve(new Response(JSON.stringify(response))),
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = testQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
        </QueryClientProvider>
    )

    return {
        fetchMock,
        ...renderHook(() => ({ meta: useMeta(), navigate: useNavigate() }), {
            wrapper,
        }),
    }
}

describe('useMeta', () => {
    it('asks for the default range and returns the typed data', async () => {
        const { fetchMock, result } = setup('/')

        await waitFor(() => expect(result.current.meta.isSuccess).toBe(true))

        expect(fetchMock).toHaveBeenCalledOnce()
        expect(fetchMock.mock.calls[0]?.[0]).toBe('/trail/api/meta?range=24h')
        expect(result.current.meta.data?.data.traces.running).toBe(
            response.data.traces.running,
        )
    })

    it('asks for the range the URL selects', async () => {
        const { fetchMock, result } = setup('/?range=7d')

        await waitFor(() => expect(result.current.meta.isSuccess).toBe(true))

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/trail/api/meta?range=7d')
    })

    it("keeps the previous range's data on screen while the next one loads", async () => {
        const { fetchMock, result } = setup('/')

        await waitFor(() => expect(result.current.meta.isSuccess).toBe(true))

        const previous = result.current.meta.data
        fetchMock.mockImplementation(() => new Promise<Response>(() => {}))

        act(() => {
            void result.current.navigate({ search: '?range=7d' })
        })

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

        expect(fetchMock.mock.calls[1]?.[0]).toBe('/trail/api/meta?range=7d')
        expect(result.current.meta.isPlaceholderData).toBe(true)
        expect(result.current.meta.data).toBe(previous)
    })
})
