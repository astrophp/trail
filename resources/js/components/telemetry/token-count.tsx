import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

type TokenCountProps = {
    /** One count of a call, as the provider reported it; `null` when it did not. */
    count: number | null
    /** The call has not finished, so no count is final. */
    pending?: boolean
    className?: string
}

/** A single token count. A count that was not reported says so, and a call in flight says `Pending`; neither is ever zero. */
export function TokenCount({ count, pending, className }: TokenCountProps) {
    if (pending || count === null) {
        return (
            <span
                data-slot="token-count"
                className={cn('text-muted-foreground', className)}
            >
                {pending ? 'Pending' : 'Not reported'}
            </span>
        )
    }

    return (
        <span data-slot="token-count" className={cn('tabular-nums', className)}>
            {formatCount(count)}
        </span>
    )
}
