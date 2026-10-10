import { formatRate } from '@/lib/format'
import { cn } from '@/lib/utils'

type RateValueProps = {
    /** A share from 0 to 1, or `null` when there was nothing to take a share of. */
    rate: number | null
    className?: string
}

/** A share of runs as a percentage. Without finished runs there is no share, and that is said, never `0%`. */
export function RateValue({ rate, className }: RateValueProps) {
    if (rate === null) {
        return (
            <span
                data-slot="rate-value"
                className={cn('text-muted-foreground', className)}
            >
                No finished runs
            </span>
        )
    }

    return (
        <span data-slot="rate-value" className={cn('tabular-nums', className)}>
            {formatRate(rate)}
        </span>
    )
}
