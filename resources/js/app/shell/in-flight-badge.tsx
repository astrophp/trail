import { SidebarMenuBadge } from '@/components/ui/sidebar'
import { useMeta } from '@/features/meta'

/** How many runs are in flight; 0 while that is unknown, so a quiet zero never shows. */
export function useInFlightCount(): number {
    const { data } = useMeta()

    return data?.data.traces.running ?? 0
}

/**
 * The count of runs in flight, beside "Traces". The text read aloud carries `id`, so
 * the link it sits beside can describe itself with it.
 */
export function InFlightBadge({ count, id }: { count: number; id: string }) {
    if (count === 0) {
        return null
    }

    return (
        <SidebarMenuBadge>
            <span aria-hidden="true">{count}</span>
            <span id={id} className="sr-only">
                {count === 1 ? '1 run in flight' : `${count} runs in flight`}
            </span>
        </SidebarMenuBadge>
    )
}
