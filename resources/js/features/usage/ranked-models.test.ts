import { describe, expect, it } from 'vitest'
import {
    rankingFor,
    rankingNote,
    usageModelsLink,
} from '@/features/usage/ranked-models'

describe('usageModelsLink', () => {
    it.each([
        ['24h', '-cost', '?by=model'],
        ['24h', '-runs', '?by=model&sort=-runs'],
        ['1h', '-cost', '?by=model&range=1h'],
        ['7d', '-runs', '?by=model&range=7d&sort=-runs'],
    ] as const)(
        'leads to the usage by model for %s ranked by %s',
        (range, sort, search) => {
            expect(usageModelsLink(range, sort)).toEqual({
                pathname: '/usage',
                search,
            })
        },
    )
})

describe('rankingFor', () => {
    it('is runs for Volume and Duration, whose figure is not kept per model, and cost for Cost', () => {
        expect(rankingFor.volume).toBe('-runs')
        expect(rankingFor.duration).toBe('-runs')
        expect(rankingFor.cost).toBe('-cost')
    })
})

describe('rankingNote', () => {
    it.each([
        ['volume', false, 'Ranked by runs.'],
        ['cost', false, 'Ranked by estimated cost.'],
        [
            'duration',
            false,
            'Models are ranked by runs because duration is not recorded per model.',
        ],
        [
            'volume',
            true,
            'Ranked by runs among the models read; some were not.',
        ],
        [
            'cost',
            true,
            'Ranked by estimated cost among the models read; some were not.',
        ],
        [
            'duration',
            true,
            'Ranked by runs among the models read (some were not), because duration is not recorded per model.',
        ],
    ] as const)('says for %s (cut: %s) %s', (metric, cut, note) => {
        expect(rankingNote(metric, cut)).toBe(note)
    })
})
