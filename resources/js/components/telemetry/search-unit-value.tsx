import { formatSearchUnits } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Exact search-unit evidence; never pass a decimal quantity through a floating point sum. */
export function SearchUnitValue({
    count,
    pending = false,
    className,
}: {
    count: string | null
    pending?: boolean
    className?: string
}) {
    return (
        <span
            data-slot="search-unit-value"
            className={cn(
                count === null || pending
                    ? 'text-muted-foreground'
                    : 'tabular-nums',
                className,
            )}
        >
            {pending
                ? 'Pending'
                : count === null
                  ? 'Not reported'
                  : formatSearchUnits(count)}
        </span>
    )
}
