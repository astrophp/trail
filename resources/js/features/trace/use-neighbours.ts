import { useQuery } from '@tanstack/react-query'
import { fetchNeighbours, traceKeys, type TraceListParams } from '@/api/traces'

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
