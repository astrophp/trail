import { describe, expect, it } from 'vitest'
import { buildSpanTree } from '@/features/trace/build-span-tree'
import {
    filterTree,
    isFiltering,
    isProblem,
} from '@/features/trace/filter-tree'
import { makeAgentSpan, makeStepSpan, makeToolSpan } from '@/test/trace-api'

// An agent that failed over: attempt 1 holds a failed step and a tool; attempt 2 a step and a tool.
const tree = buildSpanTree([
    makeAgentSpan('root', { sequence: 1 }),
    makeStepSpan('a1-step', {
        sequence: 2,
        parent_id: 'root',
        attempt: 1,
        step_number: 0,
        status: 'failed',
        model: 'gpt-5',
    }),
    makeToolSpan('a1-tool', {
        sequence: 3,
        parent_id: 'root',
        attempt: 1,
        name: 'Lookup',
    }),
    makeStepSpan('a2-step', {
        sequence: 4,
        parent_id: 'root',
        attempt: 2,
        step_number: 0,
        model: 'claude-sonnet-4-5',
    }),
    makeToolSpan('a2-tool', {
        sequence: 5,
        parent_id: 'root',
        attempt: 2,
        name: 'Fetch',
        status: 'incomplete',
    }),
])

const plain = { query: '', problemsOnly: false }

describe('filterTree', () => {
    it('is null while nothing narrows the tree', () => {
        expect(filterTree(tree, plain)).toBeNull()
        expect(
            filterTree(tree, { query: '   ', problemsOnly: false }),
        ).toBeNull()
        expect(isFiltering(plain)).toBe(false)
        expect(isFiltering({ query: 'x', problemsOnly: false })).toBe(true)
        expect(isFiltering({ query: '', problemsOnly: true })).toBe(true)
    })

    it('matches a title, ignoring case, and keeps the ancestors and the attempt row', () => {
        const keep = filterTree(tree, { query: 'LOOKUP', problemsOnly: false })

        expect([...(keep ?? [])].sort()).toEqual([
            'a1-tool',
            'attempt:root:1',
            'root',
        ])
    })

    it('matches the type words of a span', () => {
        const keep = filterTree(tree, {
            query: 'tool call',
            problemsOnly: false,
        })

        expect(keep?.has('a1-tool')).toBe(true)
        expect(keep?.has('a2-tool')).toBe(true)
        expect(keep?.has('a1-step')).toBe(false)
    })

    it('matches a model', () => {
        const keep = filterTree(tree, { query: 'sonnet', problemsOnly: false })

        expect([...(keep ?? [])].sort()).toEqual([
            'a2-step',
            'attempt:root:2',
            'root',
        ])
    })

    it('keeps only failed and incomplete spans for problems only', () => {
        const keep = filterTree(tree, { query: '', problemsOnly: true })

        expect([...(keep ?? [])].sort()).toEqual([
            'a1-step',
            'a2-tool',
            'attempt:root:1',
            'attempt:root:2',
            'root',
        ])
    })

    it('combines a search and problems only with and', () => {
        const keep = filterTree(tree, { query: 'step', problemsOnly: true })

        expect([...(keep ?? [])].sort()).toEqual([
            'a1-step',
            'attempt:root:1',
            'root',
        ])
    })

    it('is an empty set when nothing matches', () => {
        expect(
            filterTree(tree, { query: 'zzz', problemsOnly: false })?.size,
        ).toBe(0)
    })
})

describe('isProblem', () => {
    it('is true for failed and incomplete spans only', () => {
        expect(isProblem({ status: 'failed' })).toBe(true)
        expect(isProblem({ status: 'incomplete' })).toBe(true)
        expect(isProblem({ status: 'completed' })).toBe(false)
        expect(isProblem({ status: 'running' })).toBe(false)
        expect(isProblem({ status: 'awaiting_approval' })).toBe(false)
    })
})

describe('filterTree: what the row shows', () => {
    const shown = buildSpanTree([
        makeAgentSpan('root', { sequence: 1 }),
        makeToolSpan('ask', { sequence: 2, parent_id: 'root', name: 'ask' }),
        makeAgentSpan('inner', {
            sequence: 3,
            parent_id: 'ask',
            name: 'Inner',
        }),
        makeToolSpan('bad', {
            sequence: 4,
            parent_id: 'root',
            name: 'broken',
            status: 'failed',
        }),
    ])

    it('matches the second line of a row: a delegated agent says so', () => {
        const keep = filterTree(shown, {
            query: 'delegated',
            problemsOnly: false,
        })

        expect([...(keep ?? [])].sort()).toEqual(['ask', 'inner', 'root'])
        expect(
            filterTree(shown, { query: 'agent run', problemsOnly: false })?.has(
                'root',
            ),
        ).toBe(true)
        expect(
            filterTree(shown, { query: 'agent run', problemsOnly: false })?.has(
                'inner',
            ),
        ).toBe(false)
    })

    it('matches the status word of a row', () => {
        const keep = filterTree(shown, { query: 'failed', problemsOnly: false })

        expect([...(keep ?? [])].sort()).toEqual(['bad', 'root'])
    })
})

describe('filterTree: walking up', () => {
    it('visits each parent once on a chain of 2,000 spans where every span matches', () => {
        const spans = Array.from({ length: 2000 }, (_, level) =>
            makeAgentSpan(`n${level}`, {
                sequence: level + 1,
                name: 'node',
                parent_id: level === 0 ? null : `n${level - 1}`,
            }),
        )
        const tree = buildSpanTree(spans)
        let visits = 0
        const rowById = new Map(tree.rowById)
        const get = rowById.get.bind(rowById)

        rowById.get = (id: string) => {
            visits++

            return get(id)
        }

        const keep = filterTree(
            { ...tree, rowById },
            { query: 'node', problemsOnly: false },
        )

        expect(keep?.size).toBe(2000)
        // One look-up per match to find its parent, and none for the walk past a kept parent.
        expect(visits).toBeLessThanOrEqual(2 * 2000)
    })
})
