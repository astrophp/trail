import type { To } from 'react-router'
import { traceListParams } from '@/api/trace-list-view'
import { timeRangeParam, type TimeRangePreset } from '@/lib/time-range'
import { writeState, type State } from '@/lib/url-state'

const linkParams = { range: timeRangeParam, ...traceListParams }

/**
 * The traces list for a range, narrowed by `filters`, written with the list's own parameters:
 * what the list reads from the address is what this writes. A value the list would use anyway
 * (the default range, the default sort) is left out, as the list leaves it out.
 */
export function tracesLink(
    range: TimeRangePreset,
    filters: Partial<State<typeof traceListParams>> = {},
): To {
    const search = writeState(linkParams, new URLSearchParams(), {
        range,
        ...filters,
    }).toString()

    return { pathname: '/traces', search: search === '' ? '' : `?${search}` }
}
