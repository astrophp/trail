import type { To } from 'react-router'
import { traceFilterKeys, traceListParams } from '@/api/trace-list-view'
import { timeRangeParam, type TimeRangePreset } from '@/lib/time-range'
import { writeState, type State } from '@/lib/url-state'

const linkParams = { range: timeRangeParam, ...traceListParams }

/** The filters of the traces list, by the list's own parameters. */
export type TraceLinkFilters = Partial<State<typeof traceListParams>>

/**
 * Builds the link to the traces list for the range of the data a link sits beside, narrowed by
 * the given filters. A page that is about one agent passes a builder that adds the agent to every
 * link, so its figures cannot lead to other agents' runs.
 */
export type TracesLinker = (
    range: TimeRangePreset,
    filters?: TraceLinkFilters,
) => To

/** The same, for the filters an API item names: parameters of `GET /api/traces` as strings. */
export type TracesLinkerFor = (
    range: TimeRangePreset,
    filters: Record<string, string>,
) => To

/**
 * The traces list for a range, narrowed by `filters`, written with the list's own parameters:
 * what the list reads from the address is what this writes. A value the list would use anyway
 * (the default range, the default sort) is left out, as the list leaves it out. `base` is what
 * every link of a page carries; a filter of the same name given in `filters` takes its place.
 */
export function tracesLink(
    range: TimeRangePreset,
    filters: TraceLinkFilters = {},
    base: TraceLinkFilters = {},
): To {
    const search = writeState(linkParams, new URLSearchParams(), {
        range,
        ...base,
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
 * does not keep in its address, a value it would not read, and a value the address would leave out
 * (one that is the parameter's own default, such as an empty tool name) all throw instead.
 */
export function tracesLinkFor(
    range: TimeRangePreset,
    filters: Record<string, string>,
    base: TraceLinkFilters = {},
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

    const to = tracesLink(range, state, base)
    const written = new URLSearchParams(typeof to === 'string' ? '' : to.search)

    for (const name of Object.keys(filters)) {
        if (!written.has(name)) {
            throw new Error(
                `The traces list would leave the "${name}" filter out of its address: "${filters[name]}" is what it means by no filter.`,
            )
        }
    }

    return to
}

/** The builders of a page whose links all carry `base`. */
export function tracesLinkers(base: TraceLinkFilters = {}): {
    link: TracesLinker
    linkFor: TracesLinkerFor
} {
    return {
        link: (range, filters) => tracesLink(range, filters, base),
        linkFor: (range, filters) => tracesLinkFor(range, filters, base),
    }
}
