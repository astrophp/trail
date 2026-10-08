import { describe, expect, it } from 'vitest'
import { toApiSort, toTableSort } from '@/lib/table-sort'

const sorts = ['name', '-name', 'weight', '-weight'] as const

describe('table sort mapping', () => {
    it.each([
        ['name', { id: 'name', desc: false }],
        ['-name', { id: 'name', desc: true }],
        ['weight', { id: 'weight', desc: false }],
        ['-weight', { id: 'weight', desc: true }],
    ] as const)('%s is the table sort %j, both ways', (api, table) => {
        expect(toTableSort(api)).toEqual(table)
        expect(toApiSort(sorts, table)).toBe(api)
    })

    it('throws for a column the API cannot sort by', () => {
        expect(() => toApiSort(sorts, { id: 'origin', desc: true })).toThrow(
            'The API cannot sort by "origin".',
        )
    })

    it('throws for a direction the API does not take for a column', () => {
        expect(() =>
            toApiSort(['name'] as const, { id: 'name', desc: true }),
        ).toThrow('The API cannot sort by "name".')
    })
})
