import { useQuery } from '@tanstack/react-query'
import { fetchTrace, traceKeys } from '@/api/traces'

/**
 * One run with its spans. There is deliberately no placeholder data: when the id changes, the
 * previous run's spans must never show under the next run's header, so the new run loads from
 * nothing (or from its own cache).
 */
export function useTrace(id: string) {
    return useQuery({
        queryKey: traceKeys.detail(id),
        queryFn: ({ signal }) => fetchTrace(id, signal),
    })
}
