import { useCallback } from 'react'
import { useUrlState } from '@/hooks/use-url-state'
import {
    defaultTimeRange,
    timeRangePresets,
    type TimeRangePreset,
} from '@/lib/time-range'
import { enumParam, intParam, writeState } from '@/lib/url-state'

const params = {
    range: enumParam(timeRangePresets, defaultTimeRange),
    // The convention: every list keeps its page under `page`.
    page: intParam(1, { min: 1 }),
}

/**
 * The time range every page shares, kept in the URL as `?range=`.
 *
 * A new range always starts at the first page: every list keeps its page under `page`, and
 * `setRange` drops it in the same write, so the change is one history entry. Other
 * parameters stay as they are.
 */
export function useTimeRange(): [
    TimeRangePreset,
    (range: TimeRangePreset) => void,
] {
    const [{ range }, setState] = useUrlState(params)
    const setRange = useCallback(
        (next: TimeRangePreset) => setState({ range: next, page: 1 }),
        [setState],
    )

    return [range, setRange]
}

/**
 * Where a link to `path` goes so that the time range carries over: the path with
 * the current `?range=`, and nothing else of the current query. The default range
 * is not written, so the link is the bare path.
 */
export function useTimeRangeLink(): (path: string) => string {
    const [range] = useTimeRange()

    return useCallback(
        (path) => {
            const query = writeState(params, new URLSearchParams(), {
                range,
            }).toString()

            return query === '' ? path : `${path}?${query}`
        },
        [range],
    )
}
