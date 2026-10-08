import { describe, expect, it } from 'vitest'
import { buildSpanTree } from '@/features/trace/build-span-tree'
import {
    detailFixture,
    makeAgentSpan,
    makeEmbeddingSpan,
    makeStepSpan,
    makeToolSpan,
} from '@/test/trace-api'

/** The tree as nested ids, to compare shapes at a glance. */
function shape(tree: ReturnType<typeof buildSpanTree>) {
    const walk = (nodes: typeof tree.roots): unknown[] =>
        nodes.map((node) =>
            node.children.length === 0
                ? node.span.id
                : { [node.span.id]: walk(node.children) },
        )

    return walk(tree.roots)
}

const ids = (nodes: { span: { id: string } }[]) =>
    nodes.map((node) => node.span.id)

describe('buildSpanTree', () => {
    it('is empty for a run without spans', () => {
        const tree = buildSpanTree([])

        expect(tree.roots).toEqual([])
        expect(tree.nodes).toEqual([])
        expect(tree.attempts).toBe(0)
        expect(tree.visible(new Set())).toEqual([])
    })

    it('puts steps and tools under their agent, in sequence order whatever the order received', () => {
        const spans = [
            makeToolSpan('tool', { sequence: 3, parent_id: 'agent' }),
            makeStepSpan('step-1', {
                sequence: 2,
                parent_id: 'agent',
                step_number: 0,
            }),
            makeAgentSpan('agent', { sequence: 1 }),
        ]

        const tree = buildSpanTree(spans)

        expect(shape(tree)).toEqual([{ agent: ['step-1', 'tool'] }])
        expect(ids(tree.nodes)).toEqual(['agent', 'step-1', 'tool'])
        expect(tree.nodes.map((node) => node.depth)).toEqual([0, 1, 1])
        expect(tree.attempts).toBe(1)
    })

    it('tells each node its place among its siblings', () => {
        const tree = buildSpanTree([
            makeAgentSpan('agent', { sequence: 1 }),
            makeStepSpan('a', { sequence: 2, parent_id: 'agent' }),
            makeToolSpan('b', { sequence: 3, parent_id: 'agent' }),
            makeStepSpan('c', { sequence: 4, parent_id: 'agent' }),
        ])

        expect(
            tree.nodes.map((node) => [
                node.span.id,
                node.position,
                node.setSize,
                node.parentId,
            ]),
        ).toEqual([
            ['agent', 1, 1, null],
            ['a', 1, 3, 'agent'],
            ['b', 2, 3, 'agent'],
            ['c', 3, 3, 'agent'],
        ])
    })

    it('follows two levels of delegation: agent, tool, agent, tool, agent', () => {
        const tree = buildSpanTree([
            makeAgentSpan('a1', { sequence: 1 }),
            makeToolSpan('t1', { sequence: 2, parent_id: 'a1' }),
            makeAgentSpan('a2', { sequence: 3, parent_id: 't1' }),
            makeToolSpan('t2', { sequence: 4, parent_id: 'a2' }),
            makeAgentSpan('a3', { sequence: 5, parent_id: 't2' }),
            makeStepSpan('s3', { sequence: 6, parent_id: 'a3' }),
        ])

        expect(shape(tree)).toEqual([
            { a1: [{ t1: [{ a2: [{ t2: [{ a3: ['s3'] }] }] }] }] },
        ])
        expect(tree.byId.get('s3')?.depth).toBe(5)
        expect(tree.ancestors('s3')).toEqual(['a1', 't1', 'a2', 't2', 'a3'])
        expect(tree.ancestors('a1')).toEqual([])
        expect(tree.ancestors('nope')).toEqual([])
    })

    it('keeps the step numbers of each failover attempt as they are, and counts the attempts', () => {
        const tree = buildSpanTree([
            makeAgentSpan('agent', { sequence: 1 }),
            makeStepSpan('first-0', {
                sequence: 2,
                parent_id: 'agent',
                attempt: 1,
                step_number: 0,
            }),
            makeStepSpan('first-1', {
                sequence: 3,
                parent_id: 'agent',
                attempt: 1,
                step_number: 1,
            }),
            makeStepSpan('second-0', {
                sequence: 4,
                parent_id: 'agent',
                attempt: 2,
                step_number: 0,
            }),
        ])

        expect(tree.attempts).toBe(2)
        expect(
            tree.nodes.map((node) => [
                node.span.attempt,
                node.span.step_number,
            ]),
        ).toEqual([
            [1, null],
            [1, 0],
            [1, 1],
            [2, 0],
        ])
    })

    it('makes an embedding-only run a single top-level span', () => {
        const tree = buildSpanTree([makeEmbeddingSpan('e', { sequence: 1 })])

        expect(shape(tree)).toEqual(['e'])
    })

    it('shows a span whose parent is missing at the top level instead of dropping it', () => {
        const tree = buildSpanTree([
            makeAgentSpan('agent', { sequence: 1 }),
            makeToolSpan('orphan', { sequence: 2, parent_id: 'gone' }),
            makeStepSpan('step', { sequence: 3, parent_id: 'orphan' }),
        ])

        expect(shape(tree)).toEqual(['agent', { orphan: ['step'] }])
        expect(tree.byId.get('orphan')?.depth).toBe(0)
        expect(tree.byId.get('orphan')?.parentId).toBeNull()
        expect(tree.byId.get('step')?.depth).toBe(1)
    })

    it('treats a span that names itself as its parent as a top-level span', () => {
        const tree = buildSpanTree([
            makeAgentSpan('loop', { sequence: 1, parent_id: 'loop' }),
        ])

        expect(shape(tree)).toEqual(['loop'])
    })

    it('breaks a parent cycle at its earliest span without hanging or dropping any', () => {
        const spans = [
            makeAgentSpan('root', { sequence: 1 }),
            makeToolSpan('a', { sequence: 2, parent_id: 'c' }),
            makeToolSpan('b', { sequence: 3, parent_id: 'a' }),
            makeToolSpan('c', { sequence: 4, parent_id: 'b' }),
            makeStepSpan('hangs', { sequence: 5, parent_id: 'c' }),
        ]

        const tree = buildSpanTree(spans)

        expect(tree.nodes).toHaveLength(spans.length)
        expect(new Set(ids(tree.nodes))).toEqual(
            new Set(spans.map((span) => span.id)),
        )
        expect(ids(tree.roots)).toEqual(['root', 'a'])
        expect(shape(tree)).toEqual([
            'root',
            { a: [{ b: [{ c: ['hangs'] }] }] },
        ])
    })

    it('does not overflow the stack on a very deep run', () => {
        const spans = Array.from({ length: 20_000 }, (_, index) =>
            makeToolSpan(`s${index}`, {
                sequence: index,
                parent_id: index === 0 ? null : `s${index - 1}`,
            }),
        )

        const tree = buildSpanTree(spans)

        expect(tree.nodes).toHaveLength(20_000)
        expect(tree.byId.get('s19999')?.depth).toBe(19_999)
    })

    describe('visible', () => {
        const tree = buildSpanTree([
            makeAgentSpan('a1', { sequence: 1 }),
            makeToolSpan('t1', { sequence: 2, parent_id: 'a1' }),
            makeAgentSpan('a2', { sequence: 3, parent_id: 't1' }),
            makeStepSpan('s2', { sequence: 4, parent_id: 'a2' }),
            makeStepSpan('s1', { sequence: 5, parent_id: 'a1' }),
        ])

        it('is every node when nothing is collapsed', () => {
            expect(ids(tree.visible(new Set()))).toEqual([
                'a1',
                't1',
                'a2',
                's2',
                's1',
            ])
        })

        it('leaves out everything under a collapsed span, however deep', () => {
            expect(ids(tree.visible(new Set(['t1'])))).toEqual([
                'a1',
                't1',
                's1',
            ])
            expect(ids(tree.visible(new Set(['a1'])))).toEqual(['a1'])
        })

        it('keeps what was collapsed inside a span that is opened again', () => {
            expect(ids(tree.visible(new Set(['a2'])))).toEqual([
                'a1',
                't1',
                'a2',
                's1',
            ])
        })

        it('ignores a collapsed id that has no children', () => {
            expect(ids(tree.visible(new Set(['s1'])))).toHaveLength(5)
        })
    })

    it('builds the tree of the frozen response: delegation, failover and a failed tool', () => {
        const tree = buildSpanTree(detailFixture.data.spans)

        expect(tree.nodes).toHaveLength(11)
        expect(shape(tree)).toEqual([
            {
                'span-01': [
                    'span-02',
                    {
                        'span-03': [
                            { 'span-04': ['span-05', 'span-06'] },
                            'span-07',
                        ],
                    },
                    'span-08',
                    'span-09',
                    'span-10',
                    'span-11',
                ],
            },
        ])
        expect(tree.attempts).toBe(2)
    })
})
