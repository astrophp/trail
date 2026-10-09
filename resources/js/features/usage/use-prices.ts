import { useQuery } from '@tanstack/react-query'
import { fetchPrices, priceKeys } from '@/api/prices'

/**
 * Every model Trail knows and what it is priced at. The list is read when the panel opens and
 * again after a write settles; it is not polled, since only a person changes a price here.
 */
export function usePrices() {
    return useQuery({
        queryKey: priceKeys.list,
        queryFn: ({ signal }) => fetchPrices(signal),
    })
}
