import { createContext, useContext } from 'react'
import { ApiError } from '@/api/client'

/**
 * Why the dashboard cannot be used until the page is reloaded: the session ended (401, or 419 when
 * the CSRF token expired) or access was taken away (403).
 */
export type SessionIssue = 'ended' | 'denied'

/** The session issue a failure points to, or null for any other failure (404, 422, 500, no response…). */
export function sessionIssueOf(error: unknown): SessionIssue | null {
    if (!(error instanceof ApiError)) {
        return null
    }

    if (error.status === 401 || error.status === 419) {
        return 'ended'
    }

    return error.status === 403 ? 'denied' : null
}

export const SessionIssueContext = createContext<SessionIssue | null>(null)

/** The latest session issue any request ran into, or null. Provided by `QueryProvider`. */
export function useSessionIssue(): SessionIssue | null {
    return useContext(SessionIssueContext)
}
