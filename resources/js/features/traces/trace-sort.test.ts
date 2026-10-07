import { describe, expect, it } from 'vitest'
import { traceSorts } from '@/api/traces'
import { toApiSort, toTableSort } from '@/features/traces/trace-sort'

describe('trace sort mapping', () => {
    it.each([
        ['started_at', { id: 'started_at', desc: false }],
        ['-started_at', { id: 'started_at', desc: true }],
        ['duration', { id: 'duration', desc: false }],
        ['-duration', { id: 'duration', desc: true }],
        ['cost', { id: 'cost', desc: false }],
        ['-cost', { id: 'cost', desc: true }],
        ['agent', { id: 'agent', desc: false }],
        ['-agent', { id: 'agent', desc: true }],
    ] as const)('%s is the table sort %j, both ways', (api, table) => {
        expect(toTableSort(api)).toEqual(table)
        expect(toApiSort(table)).toBe(api)
    })

    it('covers every value the API takes', () => {
        expect(traceSorts).toHaveLength(8)
    })

    it('throws for a column the API cannot sort by', () => {
        expect(() => toApiSort({ id: 'tokens', desc: true })).toThrow(
            'cannot sort traces by "tokens"',
        )
    })
})
