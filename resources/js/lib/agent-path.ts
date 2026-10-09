import { defaultTimeRange, type TimeRangePreset } from '@/lib/time-range'

/** The path one agent's page is served at, without its query. */
export const agentPagePath = '/agents/agent'

/**
 * The route of an agent's page, relative to the dashboard's base path. An agent's name is any
 * text the application chose (a slash, a space, a percent sign, a plus), so it travels in the
 * query and is encoded here and nowhere else.
 *
 * `range` is left out when it is the default, as every page leaves it out. `from` is the list the
 * page is opened from, with its view (see `returnTo`).
 */
export function agentPath(
    name: string,
    { range, from }: { range?: TimeRangePreset; from?: string } = {},
): string {
    let path = `${agentPagePath}?name=${encodeURIComponent(name)}`

    if (range !== undefined && range !== defaultTimeRange) {
        path += `&range=${range}`
    }

    if (from !== undefined) {
        path += `&from=${encodeURIComponent(from)}`
    }

    return path
}
