import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { parseReturn, type ReturnTarget } from '@/lib/return-context'

/**
 * The list pages a detail page can be opened from, as route patterns. Conversations and agents
 * join this list when they have a page that lists runs.
 */
const returnRoutes = ['/traces']

/** The list a detail page leads back to when it was not opened from one. */
const fallback = '/traces'

/**
 * The page the URL's `from` parameter points back to, or `null` when it has none or it is not a
 * path inside the dashboard to a known list. Validated on every read, never echoed as it came.
 */
export function useReturnTarget(): ReturnTarget | null {
    const [search] = useSearchParams()
    const from = search.get('from')

    return useMemo(() => parseReturn(from, returnRoutes), [from])
}

/**
 * Where the way back goes and what to call it: the list the run was opened from with the view it
 * had, or the bare list. `from` is the validated target as a `from` value (`null` without one).
 */
export function useBackLink(): {
    to: string
    label: string
    from: string | null
} {
    const target = useReturnTarget()
    const from = target === null ? null : `${target.pathname}${target.search}`

    // The only list there is for now; each list will bring its own words.
    return { to: from ?? fallback, label: 'Back to traces', from }
}
