import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    forgetAgentRefreshFailures,
    useAgent,
} from '@/features/agents/use-agent'
import {
    forgetBreakdownRefreshFailures,
    useAgentBreakdown,
} from '@/features/agents/use-agent-breakdown'
import type { TimeRangePreset } from '@/lib/time-range'
import {
    breakdownFor,
    deferred,
    json,
    mockApi,
    paramsOf,
    showFor,
} from '@/test/agent-page-api'
import { testQueryClient } from '@/test/render-app'

beforeEach(() => {
    forgetAgentRefreshFailures()
    forgetBreakdownRefreshFailures()
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'token',
    }
})

afterEach(() => {
    delete window.Trail
})

function render<T>(
    hook: (props: { name: string; range: TimeRangePreset }) => T,
) {
    const client = testQueryClient()

    return renderHook(hook, {
        initialProps: { name: 'Alpha', range: '24h' as TimeRangePreset },
        wrapper: ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        ),
    })
}

describe('the agent’s queries', () => {
    it('keep the previous range’s answer for the same agent as a placeholder until the next arrives', async () => {
        const next = deferred()

        mockApi({
            show: (url) =>
                paramsOf(url).range === '7d'
                    ? next.promise
                    : json(showFor(url)),
            breakdown: (url) =>
                paramsOf(url).range === '7d'
                    ? next.promise
                    : json(breakdownFor(url)),
        })

        const agent = render(({ name, range }) => useAgent(name, range))
        const breakdown = render(({ name, range }) =>
            useAgentBreakdown(name, range),
        )

        await waitFor(() => expect(agent.result.current.data).toBeDefined())
        await waitFor(() => expect(breakdown.result.current.data).toBeDefined())

        agent.rerender({ name: 'Alpha', range: '7d' })
        breakdown.rerender({ name: 'Alpha', range: '7d' })

        expect(agent.result.current.isPlaceholderData).toBe(true)
        expect(agent.result.current.data?.range.preset).toBe('24h')
        expect(breakdown.result.current.isPlaceholderData).toBe(true)
        expect(breakdown.result.current.data?.range.preset).toBe('24h')
    })

    it('never keep another agent’s answer as a placeholder', async () => {
        const next = deferred()

        mockApi({
            show: (url) =>
                paramsOf(url).name === 'Beta'
                    ? next.promise
                    : json(showFor(url)),
            breakdown: (url) =>
                paramsOf(url).name === 'Beta'
                    ? next.promise
                    : json(breakdownFor(url)),
        })

        const agent = render(({ name, range }) => useAgent(name, range))
        const breakdown = render(({ name, range }) =>
            useAgentBreakdown(name, range),
        )

        await waitFor(() => expect(agent.result.current.data).toBeDefined())
        await waitFor(() => expect(breakdown.result.current.data).toBeDefined())

        agent.rerender({ name: 'Beta', range: '24h' })
        breakdown.rerender({ name: 'Beta', range: '24h' })

        expect(agent.result.current.data).toBeUndefined()
        expect(agent.result.current.isPlaceholderData).toBe(false)
        expect(breakdown.result.current.data).toBeUndefined()
        expect(breakdown.result.current.isPlaceholderData).toBe(false)
    })

    it('ask for nothing for an empty name', async () => {
        const fetchMock = mockApi()
        const agent = render(({ range }) => useAgent('', range))

        await Promise.resolve()

        expect(agent.result.current.fetchStatus).toBe('idle')
        expect(
            fetchMock.mock.calls.filter(([url]) => url.includes('/agents/')),
        ).toEqual([])
    })
})
