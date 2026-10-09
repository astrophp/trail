import type { Cost, SpanCost } from '@/api/types'
import { formatCost } from '@/lib/format'
import { cn } from '@/lib/utils'

type CostValueProps = {
    /** A run's cost or a span's: a span is priced whole, so it is never partial. */
    cost: Cost | SpanCost
    /**
     * What a pending cost shows. `hide` (the default) is the word Pending: one run's amount so
     * far is not what it cost. `show` is for a figure over a range, where something is nearly
     * always running: the amount so far with a "So far" tag under it. A pending cost with no
     * amount is Pending either way.
     */
    pendingAmount?: 'hide' | 'show'
    className?: string
}

/** What a run cost. A cost that is not known says why, in words; it never shows an amount that is not the answer. */
export function CostValue({
    cost,
    pendingAmount = 'hide',
    className,
}: CostValueProps) {
    switch (cost.state) {
        case 'estimated':
            return (
                <span
                    data-slot="cost-value"
                    className={cn('tabular-nums', className)}
                >
                    {formatCost(cost.amount)}
                </span>
            )
        case 'partial':
            return (
                <span
                    data-slot="cost-value"
                    className={cn('flex flex-col', className)}
                >
                    <span className="tabular-nums">
                        {formatCost(cost.amount)}
                    </span>
                    <span
                        title="Covers only the steps that could be priced"
                        className="text-caption text-warning"
                    >
                        Partial
                        <span className="sr-only">
                            , covers only the steps that could be priced
                        </span>
                    </span>
                </span>
            )
        case 'unpriced':
            return (
                <span
                    data-slot="cost-value"
                    className={cn('text-warning', className)}
                >
                    Unpriced
                </span>
            )
        case 'pending':
            if (pendingAmount === 'show' && cost.amount !== null) {
                return (
                    <span
                        data-slot="cost-value"
                        className={cn('flex flex-col', className)}
                    >
                        <span className="tabular-nums">
                            {formatCost(cost.amount)}
                        </span>
                        <span
                            title="Runs are still running, so this can still grow"
                            className="text-caption text-warning"
                        >
                            So far
                            <span className="sr-only">
                                , runs are still running, so this can still grow
                            </span>
                        </span>
                    </span>
                )
            }

            // The amount so far is deliberately not shown: it is not what the run cost.
            return (
                <span
                    data-slot="cost-value"
                    className={cn('text-muted-foreground', className)}
                >
                    Pending
                </span>
            )
        case 'not_captured':
            return (
                <span
                    data-slot="cost-value"
                    className={cn('text-muted-foreground', className)}
                >
                    Not captured
                </span>
            )
    }
}
