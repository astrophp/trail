import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { fetchSearch, searchKeys, searchMinimum } from '@/api/search'
import type { SearchResponse } from '@/api/types'
import type { TimeRangePreset } from '@/lib/time-range'

/** How long typing must pause before a request is made. */
export const searchPause = 250

export type PaletteSearch =
    /** Nothing was asked: the text is too short, or the server did not search it. */
    | { phase: 'idle' }
    /** The text is waiting out the pause, or its request is in flight. */
    | { phase: 'loading' }
    | { phase: 'failed'; error: unknown; retry: () => void }
    /** The server's answer to exactly this text. */
    | { phase: 'ready'; response: SearchResponse }

/**
 * What `GET /api/search` says about `query` (already trimmed) within `range`.
 *
 * The answer shown is always the answer to the text on screen: the query is keyed by the text and
 * the range, no previous answer is kept as a placeholder, and while the text is still in its pause
 * or its request is out, the phase is `loading` and carries no data. Typing again moves the
 * observer to another key, which aborts the request that was in flight for the old one (its
 * signal is the query's own). A query is not kept once nothing shows it, and it is never repeated
 * on a timer.
 */
export function usePaletteSearch(
    query: string,
    range: TimeRangePreset,
): PaletteSearch {
    const eligible = Array.from(query).length >= searchMinimum
    const [settled, setSettled] = useState('')

    useEffect(() => {
        const timer = setTimeout(() => setSettled(query), searchPause)

        return () => clearTimeout(timer)
    }, [query])

    const paused = settled !== query
    const result = useQuery({
        queryKey: searchKeys.for(query, range),
        queryFn: ({ signal }) => fetchSearch({ q: query, range }, signal),
        enabled: eligible && !paused,
        retry: false,
        gcTime: 0,
        staleTime: 0,
        refetchOnWindowFocus: false,
    })

    if (!eligible) {
        return { phase: 'idle' }
    }

    if (paused) {
        return { phase: 'loading' }
    }

    if (result.data !== undefined) {
        return result.data.query.searched
            ? { phase: 'ready', response: result.data }
            : { phase: 'idle' }
    }

    if (result.isError && !result.isFetching) {
        return {
            phase: 'failed',
            error: result.error,
            retry: () => void result.refetch(),
        }
    }

    return { phase: 'loading' }
}
