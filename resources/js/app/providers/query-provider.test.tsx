import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { createQueryClient, shouldRetry } from '@/app/providers/query-provider'

describe('shouldRetry', () => {
    it('retries a request that got no response, twice', () => {
        const error = new ApiError('offline')

        expect(shouldRetry(0, error)).toBe(true)
        expect(shouldRetry(1, error)).toBe(true)
        expect(shouldRetry(2, error)).toBe(false)
    })

    it('never retries an answer', () => {
        expect(shouldRetry(0, new ApiError('Nope.', 403))).toBe(false)
        expect(shouldRetry(0, new ApiError('Bad.', 422, {}))).toBe(false)
        expect(shouldRetry(0, new ApiError('Broken.', 500))).toBe(false)
        expect(shouldRetry(0, new Error('Unexpected'))).toBe(false)
    })
})

describe('createQueryClient', () => {
    function Probe({ queryFn }: { queryFn: () => Promise<string> }) {
        const { status } = useQuery({ queryKey: ['probe'], queryFn })

        return <p>{status}</p>
    }

    const run = (queryFn: () => Promise<string>) => {
        const client = createQueryClient({ queries: { retryDelay: 0 } })

        render(
            <QueryClientProvider client={client}>
                <Probe queryFn={queryFn} />
            </QueryClientProvider>,
        )
    }

    it('retries a network failure and then gives up', async () => {
        const queryFn = vi.fn(() => Promise.reject(new ApiError('offline')))

        run(queryFn)

        await waitFor(() =>
            expect(screen.getByText('error')).toBeInTheDocument(),
        )
        expect(queryFn).toHaveBeenCalledTimes(3)
    })

    it('does not retry an API error', async () => {
        const queryFn = vi.fn(() =>
            Promise.reject(new ApiError('Forbidden.', 403)),
        )

        run(queryFn)

        await waitFor(() =>
            expect(screen.getByText('error')).toBeInTheDocument(),
        )
        expect(queryFn).toHaveBeenCalledTimes(1)
    })
})
