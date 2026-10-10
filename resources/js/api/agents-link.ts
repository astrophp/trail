import type { To } from 'react-router'
import { agentListParams, type AgentListView } from '@/api/agent-list-view'
import { timeRangeParam, type TimeRangePreset } from '@/lib/time-range'
import { writeState } from '@/lib/url-state'

const linkParams = { range: timeRangeParam, ...agentListParams }

/**
 * The agents list for a range, narrowed by `filters`, written with the list's own parameters:
 * what the list reads from the address is what this writes, and a value the list would use anyway
 * (the default range, the default sort) is left out.
 */
export function agentsLink(
    range: TimeRangePreset,
    filters: Partial<Pick<AgentListView, 'search'>> = {},
): To {
    const search = writeState(linkParams, new URLSearchParams(), {
        range,
        ...filters,
    }).toString()

    return { pathname: '/agents', search: search === '' ? '' : `?${search}` }
}
