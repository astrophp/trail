import type { CostState, SpanLimit } from '@/api/types'
import type { Unpriced } from '@/features/trace/unpriced-models'
import { formatCount } from '@/lib/format'

/** The cost explained in words, by its state. A partial or unpriced one goes on to name the models (see `unpricedSentence`). */
export const costExplanations: Record<CostState, string> = {
    estimated:
        'Calculated from the recorded usage and the configured model prices.',
    partial: 'Covers only the steps and embeddings that could be priced.',
    unpriced: 'None of the models in this run has a configured price.',
    pending: 'The run has not finished. Usage and cost are not final.',
    not_captured: 'No usage was reported, so there was nothing to price.',
}

/**
 * Which models need a price, for a cost that is partial or unpriced; `null` for any other state,
 * or when there is nothing to say. The rows may be only the first spans of the run, and then the
 * sentence says what it covers, and says so when the unpriced steps are not among them.
 */
export function unpricedSentence(
    state: CostState,
    { models, uncaptured }: Unpriced,
    spanLimit: SpanLimit,
): string | null {
    if (state !== 'partial' && state !== 'unpriced') {
        return null
    }

    const limit = formatCount(spanLimit.limit)

    if (models.length === 0 && uncaptured === 0) {
        return spanLimit.truncated
            ? `The unpriced steps are beyond the first ${limit} spans.`
            : null
    }

    const steps = `${formatCount(uncaptured)} ${uncaptured === 1 ? 'step' : 'steps'} whose model was not captured`
    const named =
        models.length === 0
            ? `no price could be applied to ${steps}`
            : `no price is configured for: ${models.join(', ')}${uncaptured === 0 ? '' : ` and ${steps}`}`

    return spanLimit.truncated
        ? `Among the first ${limit} spans, ${named}.`
        : `${named[0].toUpperCase()}${named.slice(1)}.`
}
