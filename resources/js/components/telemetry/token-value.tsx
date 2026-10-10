import type { Usage } from '@/api/types'
import { formatCount, formatTokens } from '@/lib/format'
import { cn } from '@/lib/utils'

type TokenValueProps = {
    usage: Usage
    /**
     * What a pending total shows. `hide` (the default) is the word Pending. `show` is for a figure
     * over a range, where something is nearly always running: the total recorded so far with a
     * Pending tag under it. A pending usage with no total is Pending either way.
     */
    pendingAmount?: 'hide' | 'show'
    className?: string
}

/** The tokens a run used, in total. Counts that were not reported say so; they are never zero. */
export function TokenValue({
    usage,
    pendingAmount = 'hide',
    className,
}: TokenValueProps) {
    if (
        usage.state === 'pending' &&
        pendingAmount === 'show' &&
        usage.total_tokens !== null
    ) {
        return (
            <span
                data-slot="token-value"
                className={cn('flex flex-col', className)}
            >
                <span
                    title={`${formatCount(usage.total_tokens)} tokens so far`}
                    className="tabular-nums"
                >
                    <span aria-hidden="true">
                        {formatTokens(usage.total_tokens)}
                    </span>
                    <span className="sr-only">
                        {formatCount(usage.total_tokens)} tokens
                    </span>
                </span>
                <span
                    title="Runs are still running, so this can still grow"
                    className="text-caption text-warning"
                >
                    Pending
                    <span className="sr-only">
                        , runs are still running, so this can still grow
                    </span>
                </span>
            </span>
        )
    }

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
            title={`${formatCount(usage.total_tokens)} tokens`}
            className={cn('tabular-nums', className)}
        >
            <span aria-hidden="true">{formatTokens(usage.total_tokens)}</span>
            <span className="sr-only">
                {formatCount(usage.total_tokens)} tokens
            </span>
        </span>
    )
}
