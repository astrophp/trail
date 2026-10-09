import { describe, expect, it } from 'vitest'
import { rankingFor, usageModelsLink } from '@/features/usage/ranked-models'

describe('usageModelsLink', () => {
    it.each([
        ['24h', '?by=model'],
        ['1h', '?by=model&range=1h'],
        ['7d', '?by=model&range=7d'],
    ] as const)('leads to the usage by model for %s', (range, search) => {
        expect(usageModelsLink(range)).toEqual({ pathname: '/usage', search })
    })
})

describe('rankingFor', () => {
    it('ranks by cost only for Cost, and by runs for the rest, since duration is not kept per model', () => {
        expect(rankingFor).toEqual({
            volume: '-runs',
            duration: '-runs',
            cost: '-cost',
        })
    })
})
