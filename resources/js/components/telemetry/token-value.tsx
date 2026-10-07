import type { Usage } from '@/api/types'
import { formatTokens, formatTokensExact } from '@/lib/format'
import { cn } from '@/lib/utils'

type TokenValueProps = {
    usage: Usage
    className?: string
}

/** The tokens a run used, in total. Counts that were not reported say so; they are never zero. */
export function TokenValue({ usage, className }: TokenValueProps) {
    if (usage.state === 'pending') {
        return (
            <span
                data-slot="token-value"
                className={cn('text-muted-foreground', className)}
            >
                Pending
            </span>
        )
    }

    // `reported` may carry only cache or reasoning counts: then there is no total to show.
    if (usage.state === 'not_reported' || usage.total_tokens === null) {
        return (
            <span
                data-slot="token-value"
                className={cn('text-muted-foreground', className)}
            >
                Not reported
            </span>
        )
    }

    return (
        <span
            data-slot="token-value"
            title={`${formatTokensExact(usage.total_tokens)} tokens`}
            className={cn('tabular-nums', className)}
        >
            <span aria-hidden="true">{formatTokens(usage.total_tokens)}</span>
            <span className="sr-only">
                {formatTokensExact(usage.total_tokens)} tokens
            </span>
        </span>
    )
}
