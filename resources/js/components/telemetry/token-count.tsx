import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

type TokenCountProps = {
    /** One count of a call, as the provider reported it; `null` when it did not. */
    count: number | null
    /** The call has not finished, so no count is final. */
    pending?: boolean
    /**
     * What a pending count shows. `hide` (the default) is the word Pending: a call in flight has
     * no final count. `show` is for a figure over many calls, where something is nearly always
     * running: the count recorded so far, which can still grow. A pending count that was not
     * recorded is Pending either way.
     */
    pendingAmount?: 'hide' | 'show'
    className?: string
}

/** A single token count. A count that was not reported says so, and a call in flight says `Pending`; neither is ever zero. */
export function TokenCount({
    count,
    pending,
    pendingAmount = 'hide',
    className,
}: TokenCountProps) {
    if (pending && pendingAmount === 'show' && count !== null) {
        return (
            <span
                data-slot="token-count"
                title="Still running, so this can still grow"
                className={cn('tabular-nums', className)}
            >
                {formatCount(count)}
                <span className="sr-only">, still running, so far</span>
            </span>
        )
    }

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
