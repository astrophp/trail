import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchMeta } from '@/api/meta'
import { useTimeRange } from '@/hooks/use-time-range'

/** What the dashboard needs around every page; refetched when the time range changes. */
export function useMeta() {
    const [range] = useTimeRange()

    return useQuery({
        queryKey: ['meta', range],
        queryFn: ({ signal }) => fetchMeta(range, signal),
        // The last range's data stays on screen while the next one loads.
        placeholderData: keepPreviousData,
        // Keeps the in-flight count live; TanStack pauses interval refetching in a hidden tab.
        refetchInterval: 30_000,
    })
}
