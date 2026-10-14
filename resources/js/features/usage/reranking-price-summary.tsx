import type { Price } from '@/api/types'
import { PriceRate } from '@/components/telemetry/price-rate'
import { cn } from '@/lib/utils'

/** A reranking unit rate and its independent source, visible without opening the editor. */
export function RerankingPriceSummary({
    price,
    className,
}: {
    price: Price
    className?: string
}) {
    const group = price.reranking
    if (!group || group.rates.basis === null) return null

    const search = group.rates.basis === 'search_units'
    const source =
        group.source === 'saved'
            ? 'Saved'
            : group.source === 'config'
              ? 'Config'
              : group.source === 'prefix'
                ? `From ${group.via?.model ?? 'another model'}`
                : 'No rate'

    return (
        <p
            data-slot="reranking-price-summary"
            className={cn(
                'mt-2 text-caption font-normal text-muted-foreground',
                className,
            )}
        >
            Reranking: USD{' '}
            <PriceRate
                rate={search ? group.rates.search_unit : group.rates.input}
                className="text-foreground"
            />{' '}
            per {search ? 'search unit' : 'million input tokens'}
            <span className="block">{source} reranking price</span>
        </p>
    )
}
