import {
    QueryClient,
    QueryClientProvider,
    type QueryClientConfig,
} from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { ApiError } from '@/api/client'
import {
    SessionIssueContext,
    sessionIssueOf,
    type SessionIssue,
} from '@/app/providers/session-issue'

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

/**
 * Provides the query client, and watches every request made through it: when one fails because
 * the session ended or access was lost, that is recorded once here for the shell to show, so no
 * page or feature handles it. It listens to the caches rather than to a client option, so it also
 * covers a client passed in. The issue stays until the page is reloaded, which is the way out, even if a later request
 * succeeds: by design, since a later answer does not give back a CSRF token or a sign-in, and a
 * dashboard that flickered between the state and the page would be worse than one that asks once.
 */
export function QueryProvider({
    client,
    children,
}: {
    /** A client of the caller's own; one with the dashboard's defaults is made when absent. */
    client?: QueryClient
    children: ReactNode
}) {
    const [fallback] = useState(createQueryClient)
    const [issue, setIssue] = useState<SessionIssue | null>(null)
    const active = client ?? fallback

    useEffect(() => {
        const record = (error: unknown) => {
            const found = sessionIssueOf(error)

            if (found !== null) {
                setIssue(found)
            }
        }
        const stopQueries = active.getQueryCache().subscribe((event) => {
            if (event.type === 'updated' && event.action.type === 'error') {
                record(event.action.error)
            }
        })
        const stopMutations = active.getMutationCache().subscribe((event) => {
            if (event.type === 'updated' && event.action.type === 'error') {
                record(event.action.error)
            }
        })

        return () => {
            stopQueries()
            stopMutations()
        }
    }, [active])

    return (
        <QueryClientProvider client={active}>
            <SessionIssueContext value={issue}>{children}</SessionIssueContext>
        </QueryClientProvider>
    )
}
