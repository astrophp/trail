import { formatCount } from '@/lib/format'

/** A count of runs, in the singular for one. */
export const runsText = (count: number): string =>
    `${formatCount(count)} ${count === 1 ? 'run' : 'runs'}`

/** A count of model steps or tool calls, in the singular for one. */
export const callsText = (count: number): string =>
    `${formatCount(count)} ${count === 1 ? 'call' : 'calls'}`

/**
 * A row's part of the agent's own runs, from 0 to 1: the runs that used it over the runs there
 * are. Both are counts the API gave. `null` when there is no total to take a part of (no runs, or
 * a total that is not of the range the row is for), so no bar is drawn.
 */
export function shareOf(runs: number, total: number | null): number | null {
    if (total === null || total <= 0) {
        return null
    }

    return Math.min(1, Math.max(0, runs / total))
}

/** How a list that was cut says so. `null` when it holds everything. */
export function cutText(limit: {
    limit: number
    total: number
}): string | null {
    return limit.total > limit.limit
        ? `Showing the first ${formatCount(limit.limit)} of ${formatCount(limit.total)}`
        : null
}
