/** How often something that is still running is fetched again, in milliseconds. */
export const refreshEvery = 2_000

/** Refreshing stops after this many failed refreshes in a row. */
export const maxFailedRefreshes = 3

/** Answers that will not change by asking again: the thing is gone, or the session or access is. */
const finalStatuses = new Set([401, 403, 404, 419])

/**
 * Where a page's refreshing stands, which is the one condition the interval and the words on the
 * page both follow:
 * - `polling`: asked for again every `refreshEvery`.
 * - `retrying`: the last refresh failed; asking goes on.
 * - `stopped`: it failed `maxFailedRefreshes` times in a row; asking stopped.
 * - `final`: the answer was final (it is gone, or the session or access is); asking stopped.
 * - `ended`: nothing is running, so there is nothing to refresh.
 */
/** What a query that follows another one needs to know of it: the leader's last answer and where its refreshing stands. */
export type Leader = {
    dataUpdatedAt: number
    isPlaceholderData: boolean
    refreshing: Refreshing
}

export type Refreshing = 'polling' | 'retrying' | 'stopped' | 'final' | 'ended'

/**
 * `running`: whether anything on the page is still running. `status`: the HTTP status of the last
 * failure (`null` or `undefined` when it had none). `failed`: the failed refreshes in a row.
 */
export function refreshState(
    running: boolean,
    status: number | null | undefined,
    failed: number,
): Refreshing {
    if (!running) {
        return 'ended'
    }

    if (status !== null && status !== undefined && finalStatuses.has(status)) {
        return 'final'
    }

    if (failed >= maxFailedRefreshes) {
        return 'stopped'
    }

    return failed > 0 ? 'retrying' : 'polling'
}

/**
 * The HTTP status a failed request carries (an `ApiError` has one), `null` when it had none: the
 * network failed, or the error is no request's.
 */
export function failureStatus(error: unknown): number | null {
    return error instanceof Error &&
        'status' in error &&
        typeof error.status === 'number'
        ? error.status
        : null
}

/** Whether the interval is to go on asking in this state. */
export const keepsAsking = (state: Refreshing): boolean =>
    state === 'polling' || state === 'retrying'

export type FailureLedger = ReturnType<typeof failureLedger>

/**
 * The failed refreshes in a row, by what is refreshed. A key is absent while its last refresh
 * worked. One ledger per kind of page; the page's data hooks share it with the words on screen.
 */
export function failureLedger() {
    const failures = new Map<string, number>()

    return {
        count: (key: string) => failures.get(key) ?? 0,
        record: (key: string) =>
            failures.set(key, (failures.get(key) ?? 0) + 1),
        clear: (key: string) => failures.delete(key),
        /** Forgets everything: for tests, which share the module. */
        reset: () => failures.clear(),
    }
}
