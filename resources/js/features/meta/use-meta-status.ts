import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '@/api/client'
import type { Meta } from '@/api/types'
import { useMeta } from '@/features/meta/use-meta'

/**
 * What the meta answer says about the dashboard as a whole, for the shell to act on.
 *
 * - `unreachable`: the request got no response and there is no meta in the cache to fall back on.
 *   It is held while "Try again" runs (a first fetch with no data resets the query to pending,
 *   which would make the error vanish under the button that was just pressed) and released when
 *   that fetch ends. A failure while data is cached is ignored: a working dashboard stays.
 * - `loading`: the first meta request is pending and nothing is cached (no answer for any range).
 *   The shell renders nothing in the content area for that moment, so the page neither mounts
 *   (and fires its queries) behind a setup screen nor flashes before it.
 * - `firstRun`: the answer says no run has ever been recorded. False while there is no answer.
 * - `recording`: the answer's recording state; undefined until there is an answer.
 */
export function useMetaStatus() {
    const meta = useMeta()
    const cache = useQueryClient().getQueryCache()
    const cached =
        meta.data !== undefined ||
        cache.find({
            queryKey: ['meta'],
            predicate: (query) => query.state.data !== undefined,
        }) !== undefined
    const failure =
        meta.isError &&
        meta.error instanceof ApiError &&
        meta.error.status === null &&
        !cached
            ? meta.error
            : null
    const [held, setHeld] = useState<ApiError | null>(null)
    // Only the very first request is waited for: once it has settled, whatever it said, a later
    // retry that puts the query back to pending must not unmount the page (which would mount it
    // again, retry again, and so on).
    const [settled, setSettled] = useState(false)

    if (!meta.isPending && !settled) {
        setSettled(true)
    }

    if (failure !== null && failure !== held) {
        setHeld(failure)
    } else if (failure === null && held !== null && !meta.isFetching) {
        setHeld(null)
    }

    const answer: Meta | undefined = meta.data?.data

    return {
        unreachable: held,
        loading: meta.isPending && !settled && !cached && held === null,
        retrying: meta.isFetching,
        retry: () => {
            void meta.refetch()
        },
        firstRun: answer?.traces.any === false,
        recording: answer?.recording,
    }
}
