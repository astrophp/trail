import type { To } from 'react-router'
import { traceFilterKeys, traceListParams } from '@/api/trace-list-view'
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

/**
 * The traces list for a range, narrowed by the `filters` an API item names: its parameters of
 * `GET /api/traces` with the strings to send. Each is read with the list's own definition of that
 * parameter, so the link says to the list what the API said to the endpoint.
 *
 * A link that dropped a filter would lead to more runs than the item counted, so a name the list
 * does not keep in its address, or a value it would not read, throws instead.
 */
export function tracesLinkFor(
    range: TimeRangePreset,
    filters: Record<string, string>,
): To {
    const state: Record<string, unknown> = {}

    for (const [name, text] of Object.entries(filters)) {
        const known = traceFilterKeys.find((key) => key === name)

        if (known === undefined) {
            throw new Error(
                `The traces list has no "${name}" filter in its address.`,
            )
        }

        const value = traceListParams[known].parse(text)

        if (value === undefined) {
            throw new Error(
                `The traces list does not read "${text}" for its "${name}" filter.`,
            )
        }

        state[known] = value
    }

    return tracesLink(range, state)
}
