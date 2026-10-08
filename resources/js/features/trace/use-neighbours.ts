import { useQuery } from '@tanstack/react-query'
import {
    fetchConversationNeighbours,
    fetchNeighbours,
    traceKeys,
    type TraceListParams,
} from '@/api/traces'

/**
 * The runs just before and after this one in a view of the list. Keyed by the run and the view,
 * with no placeholder data: the previous run's answer never stands in for the next run's, so the
 * steps are off until the answer for this run is in.
 */
export function useNeighbours(id: string, params: TraceListParams) {
    return useQuery({
        queryKey: traceKeys.neighbours(id, params),
        queryFn: ({ signal }) => fetchNeighbours(id, params, signal),
    })
}

/**
 * The turns just before and after this run in its own conversation. Nothing but the run is sent
 * (the conversation is the run's own, and no range or filter applies), and the same rule holds
 * for placeholder data: the steps are off until this run's answer is in.
 */
export function useConversationNeighbours(id: string) {
    return useQuery({
        queryKey: traceKeys.conversationNeighbours(id),
        queryFn: ({ signal }) => fetchConversationNeighbours(id, signal),
    })
}
