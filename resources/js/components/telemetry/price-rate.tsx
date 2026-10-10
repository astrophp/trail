import { formatPerMillion } from '@/lib/format'
import { cn } from '@/lib/utils'

type PriceRateProps = {
    /** US dollars per million tokens, or `null` when the model has no rate for this kind of token. */
    rate: number | null
    className?: string
}

/**
 * One rate of a price. A model with no rate for a kind of token says so with a dash (and "No
 * rate" to assistive technology): a missing rate is unknown, never free, so it is never drawn as
 * `0`. A real `0` is a free rate and is drawn as `0`.
 */
export function PriceRate({ rate, className }: PriceRateProps) {
    if (rate === null) {
        return (
            <span
                data-slot="price-rate"
                className={cn('text-muted-foreground', className)}
            >
                <span aria-hidden="true">{'—'}</span>
                <span className="sr-only">No rate</span>
            </span>
        )
    }

    return (
        <span data-slot="price-rate" className={cn('tabular-nums', className)}>
            {formatPerMillion(rate)}
        </span>
    )
}
