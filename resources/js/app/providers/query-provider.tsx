import {
    QueryClient,
    QueryClientProvider,
    type QueryClientConfig,
} from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { ApiError } from '@/api/client'

const maxNetworkRetries = 2

/** Only a request that got no response is worth repeating; an answer, even an error, is final. */
export function shouldRetry(failureCount: number, error: Error): boolean {
    return (
        error instanceof ApiError &&
        error.status === null &&
        failureCount < maxNetworkRetries
    )
}

export function createQueryClient(
    overrides: QueryClientConfig['defaultOptions'] = {},
): QueryClient {
    return new QueryClient({
        defaultOptions: {
            ...overrides,
            queries: {
                staleTime: 30_000,
                refetchOnWindowFocus: false,
                retry: shouldRetry,
                ...overrides.queries,
            },
            mutations: overrides.mutations,
        },
    })
}

export function QueryProvider({
    client,
    children,
}: {
    /** A client of the caller's own; one with the dashboard's defaults is made when absent. */
    client?: QueryClient
    children: ReactNode
}) {
    const [fallback] = useState(createQueryClient)

    return (
        <QueryClientProvider client={client ?? fallback}>
            {children}
        </QueryClientProvider>
    )
}
