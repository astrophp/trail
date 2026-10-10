import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    forgetRecentTracesRefreshFailures,
    useRecentTraces,
} from '@/features/traces/use-recent-traces'
import type { TimeRangePreset } from '@/lib/time-range'
import {
    deferred,
    json,
    mockApi,
    paramsOf,
    recentFor,
} from '@/test/agent-page-api'
import { testQueryClient } from '@/test/render-app'

beforeEach(() => {
    forgetRecentTracesRefreshFailures()
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'token',
    }
})

afterEach(() => {
    delete window.Trail
})

const leader = {
    dataUpdatedAt: 0,
    isPlaceholderData: false,
    refreshing: 'ended',
} as const

type Props = { agent: string; range: TimeRangePreset; limit: number }

function render() {
    const client = testQueryClient()

    return renderHook(
        ({ agent, range, limit }: Props) =>
            useRecentTraces(agent, range, limit, leader),
        {
            initialProps: { agent: 'Alpha', range: '24h', limit: 8 },
            wrapper: ({ children }: { children: ReactNode }) => (
                <QueryClientProvider client={client}>
                    {children}
                </QueryClientProvider>
            ),
        },
    )
}

describe('the recent traces query', () => {
    beforeEach(() => {
        const next = deferred()

        mockApi({
            traces: (url) =>
                paramsOf(url).range === '7d' || paramsOf(url).agent === 'Beta'
                    ? next.promise
                    : json(recentFor(url)),
        })
    })

    it('keeps the previous range’s runs of the same agent as a placeholder until the next arrive', async () => {
        const hook = render()

        await waitFor(() => expect(hook.result.current.data).toBeDefined())
        hook.rerender({ agent: 'Alpha', range: '7d', limit: 8 })

        expect(hook.result.current.isPlaceholderData).toBe(true)
        expect(hook.result.current.data?.range.preset).toBe('24h')
    })

    it('never keeps another agent’s runs as a placeholder', async () => {
        const hook = render()

        await waitFor(() => expect(hook.result.current.data).toBeDefined())
        hook.rerender({ agent: 'Beta', range: '24h', limit: 8 })

        expect(hook.result.current.data).toBeUndefined()
        expect(hook.result.current.isPlaceholderData).toBe(false)
    })

    it('never keeps a list of another length as a placeholder', async () => {
        const hook = render()

        await waitFor(() => expect(hook.result.current.data).toBeDefined())
        hook.rerender({ agent: 'Alpha', range: '24h', limit: 5 })

        expect(hook.result.current.isPlaceholderData).toBe(false)
    })
})
