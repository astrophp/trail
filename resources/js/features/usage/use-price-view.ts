import { useCallback, useMemo } from 'react'
import type { Price } from '@/api/types'
import { useUrlState } from '@/hooks/use-url-state'
import { searchParam } from '@/lib/search'
import { enumParam } from '@/lib/url-state'

export const priceTabs = ['seen', 'all'] as const

export type PriceTab = (typeof priceTabs)[number]

/**
 * What the price list keeps in the URL: the tab (`auto` until one is chosen, which is "seen in
 * usage" when anything was seen and "all models" when nothing was) and the text filter.
 */
const priceViewParams = {
    prices: enumParam(['auto', ...priceTabs] as const, 'auto'),
    find: searchParam,
}

/** Whether a model matches the filter: every word of it is in the provider or the model, whatever the case. */
function matches(price: Price, find: string): boolean {
    const haystack = `${price.provider} ${price.model}`.toLowerCase()

    return find
        .toLowerCase()
        .split(/\s+/)
        .every((word) => haystack.includes(word))
}

/**
 * The view of the loaded list: which tab is shown, the text filter, and the models they leave.
 * Both are in the URL; the filtering is done here, over the list as loaded. The server's order is
 * kept.
 */
export function usePriceView(prices: Price[] | undefined) {
    const [state, setState] = useUrlState(priceViewParams)

    const seen = useMemo(
        () => (prices ?? []).filter((price) => price.observed),
        [prices],
    )
    const tab: PriceTab =
        state.prices === 'auto'
            ? seen.length > 0
                ? 'seen'
                : 'all'
            : state.prices
    const shown = useMemo(() => {
        const inTab = tab === 'seen' ? seen : (prices ?? [])

        return state.find === ''
            ? inTab
            : inTab.filter((price) => matches(price, state.find))
    }, [prices, seen, tab, state.find])

    const setTab = useCallback(
        (next: PriceTab) => setState({ prices: next }),
        [setState],
    )
    const setFind = useCallback(
        (find: string, options: { replace: boolean }) =>
            setState({ find }, options),
        [setState],
    )

    return {
        tab,
        find: state.find,
        shown,
        counts: { seen: seen.length, all: prices?.length ?? 0 },
        setTab,
        setFind,
    }
}
