import { apiRequest } from '@/api/client'
import type { PriceListResponse, PriceResponse } from '@/api/types'

/** The four rates as typed: plain decimal text, or `null` for a blank. Sent as is, so nothing is rounded on the way. */
export type PriceRatesText = Record<
    'input' | 'output' | 'cache_read' | 'cache_write',
    string | null
>

/** A model's identity: the provider and the model id, both exactly as the list spells them. */
export type PriceId = { provider: string; model: string }

/**
 * The path of one model's price. The ids travel in the query, percent-encoded: a model id can
 * hold a slash, a colon, a plus sign or a space, and the server reads the raw query string.
 */
const pricePath = ({ provider, model }: PriceId) =>
    `/prices?provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}`

/** Every model Trail knows and what it is priced at. */
export function fetchPrices(signal?: AbortSignal): Promise<PriceListResponse> {
    return apiRequest<PriceListResponse>('/prices', { signal })
}

/**
 * Saves a model's price. All four rates are written every time: a `null` is stored as unknown
 * and does not keep the previous value. Answers the price as it now resolves.
 */
export function savePrice(
    id: PriceId,
    rates: PriceRatesText,
): Promise<PriceResponse> {
    return apiRequest<PriceResponse>(pricePath(id), {
        method: 'PUT',
        body: rates,
    })
}

/** Removes a model's saved price. Idempotent. Answers the price as it now resolves: its default. */
export function resetPrice(id: PriceId): Promise<PriceResponse> {
    return apiRequest<PriceResponse>(pricePath(id), { method: 'DELETE' })
}

/** The query keys of everything about prices. */
export const priceKeys = {
    list: ['prices', 'list'] as const,
    /** The key of every price write, so a reader can tell that one is under way. */
    write: ['prices', 'write'] as const,
}
