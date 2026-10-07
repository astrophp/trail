import { useCallback } from 'react'
import { useUrlState } from '@/hooks/use-url-state'
import {
    defaultTimeRange,
    timeRangePresets,
    type TimeRangePreset,
} from '@/lib/time-range'
import { enumParam } from '@/lib/url-state'

const params = { range: enumParam(timeRangePresets, defaultTimeRange) }

/** The time range every page shares, kept in the URL as `?range=`. */
export function useTimeRange(): [
    TimeRangePreset,
    (range: TimeRangePreset) => void,
] {
    const [{ range }, setState] = useUrlState(params)
    const setRange = useCallback(
        (next: TimeRangePreset) => setState({ range: next }),
        [setState],
    )

    return [range, setRange]
}
