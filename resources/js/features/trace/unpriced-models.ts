import type { UsageRow } from '@/api/types'

export type Unpriced = {
    /** Real `provider / model` pairs, each once, in order of first appearance. */
    models: string[]
    /** Unpriced rows whose provider or model was not captured, so there is no name to give. */
    uncaptured: number
}

/**
 * The models of the steps and embeddings that could not be priced: these are the prices a person
 * has to add. A row without a provider or a model is counted, never given a made-up name.
 */
export function unpricedModels(rows: UsageRow[]): Unpriced {
    const seen = new Set<string>()
    let uncaptured = 0

    for (const row of rows) {
        if (row.cost.state !== 'unpriced') {
            continue
        }

        if (row.provider === null || row.model === null) {
            uncaptured += 1
        } else {
            seen.add(`${row.provider} / ${row.model}`)
        }
    }

    return { models: [...seen], uncaptured }
}
