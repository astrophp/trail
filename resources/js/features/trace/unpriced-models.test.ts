import { describe, expect, it } from 'vitest'
import type { UsageRow } from '@/api/types'
import {
    costExplanations,
    unpricedSentence,
} from '@/features/trace/cost-explanation'
import { unpricedModels } from '@/features/trace/unpriced-models'

const usage = {
    state: 'reported',
    input_tokens: 1,
    output_tokens: 1,
    cache_read_tokens: null,
    cache_write_tokens: null,
    reasoning_tokens: null,
    total_tokens: 2,
} as const

function row(
    id: string,
    provider: string | null,
    model: string | null,
    priced: boolean,
): UsageRow {
    return {
        span_id: id,
        agent_span_id: null,
        type: 'step',
        name: 'step',
        attempt: 1,
        step_number: 0,
        provider,
        model,
        usage,
        cost: priced
            ? { state: 'estimated', amount: 0.01 }
            : { state: 'unpriced', amount: null },
    }
}

describe('unpricedModels', () => {
    it('names each unpriced model once, in order of first appearance', () => {
        expect(
            unpricedModels([
                row('a', 'openai', 'gpt-5', false),
                row('b', 'anthropic', 'claude-sonnet-4-5', true),
                row('c', 'anthropic', 'claude-haiku-4-5', false),
                row('d', 'openai', 'gpt-5', false),
            ]),
        ).toEqual({
            models: ['openai / gpt-5', 'anthropic / claude-haiku-4-5'],
            uncaptured: 0,
        })
    })

    it('is empty when every step was priced', () => {
        expect(unpricedModels([row('a', 'openai', 'gpt-5', true)])).toEqual({
            models: [],
            uncaptured: 0,
        })
    })

    it('counts rows without a provider or model instead of naming them', () => {
        expect(
            unpricedModels([
                row('a', null, null, false),
                row('b', 'openai', null, false),
                row('c', null, 'gpt-5', false),
                row('d', null, null, true),
                row('e', 'openai', 'gpt-5', false),
            ]),
        ).toEqual({ models: ['openai / gpt-5'], uncaptured: 3 })
    })
})

const limit = { limit: 2000, total: 10, truncated: false }
const cut = { limit: 2000, total: 5000, truncated: true }

describe('cost explanations', () => {
    it('has a sentence for every state', () => {
        expect(Object.keys(costExplanations).sort()).toEqual([
            'estimated',
            'not_captured',
            'partial',
            'pending',
            'unpriced',
        ])
        expect(costExplanations.partial).toBe(
            'Covers only the steps and embeddings that could be priced.',
        )
    })

    it('lists the models without a price', () => {
        expect(
            unpricedSentence(
                'partial',
                { models: ['a / b', 'c / d'], uncaptured: 0 },
                limit,
            ),
        ).toBe('No price is configured for: a / b, c / d.')
    })

    it('counts the steps whose model was not captured, in the singular and the plural', () => {
        expect(
            unpricedSentence(
                'partial',
                { models: ['a / b'], uncaptured: 1 },
                limit,
            ),
        ).toBe(
            'No price is configured for: a / b and 1 step whose model was not captured.',
        )
        expect(
            unpricedSentence('unpriced', { models: [], uncaptured: 2 }, limit),
        ).toBe(
            'No price could be applied to 2 steps whose model was not captured.',
        )
    })

    it('says what it covers when the rows are only the first spans', () => {
        expect(
            unpricedSentence(
                'partial',
                { models: ['a / b'], uncaptured: 0 },
                cut,
            ),
        ).toBe(
            'Among the first 2,000 spans, no price is configured for: a / b.',
        )
    })

    it('says the unpriced steps are out of reach when none is among the rows', () => {
        expect(
            unpricedSentence('partial', { models: [], uncaptured: 0 }, cut),
        ).toBe('The unpriced steps are beyond the first 2,000 spans.')
        expect(
            unpricedSentence('partial', { models: [], uncaptured: 0 }, limit),
        ).toBeNull()
    })

    it('says nothing for a cost that is not partial or unpriced', () => {
        expect(
            unpricedSentence(
                'estimated',
                { models: ['a / b'], uncaptured: 1 },
                cut,
            ),
        ).toBeNull()
    })
})
