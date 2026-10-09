import { fetchTraces, traceKeys } from '@/api/traces'
import { useFollowingQuery } from '@/hooks/use-following-query'
import { failureLedger, type Leader } from '@/lib/refresh-policy'
import type { TimeRangePreset } from '@/lib/time-range'

/** The failed refreshes in a row, by agent and range. */
const failures = failureLedger()

/** Forgets every view's failed refreshes: for tests, which share this module. */
export const forgetRecentTracesRefreshFailures = () => failures.reset()

/** What the list of recent runs follows: the query of the page it sits on. */
export type RecentTracesLeader = Leader

/**
 * The latest runs of an agent in a range, newest first. The previous range's answer for the same
 * agent stays as placeholder data until the next arrives; another agent's never does. It has no
 * clock of its own: it is asked for again whenever its leader is, so what it shows keeps up with
 * the figures beside it, and stops when they do.
 */
export function useRecentTraces(
    agent: string,
    range: TimeRangePreset,
    limit: number,
    leader: RecentTracesLeader,
) {
    return useFollowingQuery({
        queryKey: [...traceKeys.recent, agent, range, limit],
        fetch: (signal) =>
            fetchTraces(
                { range, agent, sort: '-started_at', per_page: limit },
                signal,
            ),
        ledger: failures,
        ledgerKey: JSON.stringify([agent, range, limit]),
        leader,
        keepsPlaceholder: (key) => key[2] === agent && key[4] === limit,
    })
}
