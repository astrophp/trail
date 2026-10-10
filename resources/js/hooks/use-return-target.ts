import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { agentPagePath } from '@/lib/agent-path'
import { comparePath } from '@/lib/compare-path'
import { transcriptPath } from '@/lib/conversation-path'
import { parseReturn, type ReturnTarget } from '@/lib/return-context'

/**
 * The pages another page can be opened from, as route patterns: the list of runs, the comparison,
 * a conversation's page, the list of agents and an agent's page.
 */
const returnRoutes = [
    '/traces',
    comparePath,
    transcriptPath,
    '/agents',
    agentPagePath,
]

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

/** What a run was opened from: the list of runs, the comparison, a conversation, an agent's page, or nothing. */
export type BackSource = 'list' | 'comparison' | 'conversation' | 'agent'

/**
 * Where the way back goes and what to call it: the page the run was opened from with the view it
 * had, or the bare list. `from` is the validated target as a `from` value, and `null` when the
 * run has no neighbours to step through (it was opened from the comparison, from an agent's page,
 * or from nothing); `source` says which page it is.
 *
 * The list of agents is not a place a run is opened from: a target that is that list is ignored,
 * and the way back is the bare list of runs.
 */
export function useBackLink(): {
    to: string
    label: string
    from: string | null
    source: BackSource
} {
    const returned = useReturnTarget()
    const target = returned?.pathname === '/agents' ? null : returned
    const from = target === null ? null : `${target.pathname}${target.search}`

    const source: BackSource =
        target?.pathname === comparePath
            ? 'comparison'
            : target?.pathname === transcriptPath
              ? 'conversation'
              : target?.pathname === agentPagePath
                ? 'agent'
                : 'list'

    return {
        to: from ?? fallback,
        label:
            source === 'comparison'
                ? 'Back to comparison'
                : source === 'conversation'
                  ? 'Back to conversation'
                  : source === 'agent'
                    ? 'Back to agent'
                    : 'Back to traces',
        // A comparison and an agent's page have no neighbours: `from` is for lists and conversations.
        from: source === 'comparison' || source === 'agent' ? null : from,
        source,
    }
}
