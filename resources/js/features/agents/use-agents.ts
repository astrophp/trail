import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { agentListApiParams, type AgentListView } from '@/api/agent-list-view'
import { agentKeys, fetchAgents } from '@/api/agents'

/**
 * The agents for a view, `perPage` of them when the endpoint's own page size is not wanted. The
 * previous view's response stays as placeholder data until the next one arrives, so a caller must
 * check `isPlaceholderData` before treating it as the answer.
 */
export function useAgents(view: AgentListView, perPage?: number) {
    return useQuery({
        queryKey: [...agentKeys.list, view, perPage ?? null],
        queryFn: ({ signal }) =>
            fetchAgents(agentListApiParams(view, perPage), signal),
        placeholderData: keepPreviousData,
    })
}
