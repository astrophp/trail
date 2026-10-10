import { useCallback } from 'react'
import { useUrlState } from '@/hooks/use-url-state'
import { timeRangeParam, type TimeRangePreset } from '@/lib/time-range'
import { intParam } from '@/lib/url-state'

const params = {
    range: timeRangeParam,
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
