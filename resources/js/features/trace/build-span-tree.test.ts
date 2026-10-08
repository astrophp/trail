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

const ids = (nodes: { id: string }[]) => nodes.map((node) => node.id)

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

    describe('attempts', () => {
        const failover = buildSpanTree([
            makeAgentSpan('root', { sequence: 1 }),
            makeStepSpan('a1-step', {
                sequence: 2,
                parent_id: 'root',
                attempt: 1,
                step_number: 0,
                status: 'failed',
            }),
            makeStepSpan('a2-step-0', {
                sequence: 3,
                parent_id: 'root',
                attempt: 2,
                step_number: 0,
            }),
            makeToolSpan('a2-tool', {
                sequence: 4,
                parent_id: 'root',
                attempt: 2,
            }),
            makeAgentSpan('delegate', {
                sequence: 5,
                parent_id: 'a2-tool',
                attempt: 2,
            }),
            makeStepSpan('delegate-step', {
                sequence: 6,
                parent_id: 'delegate',
                attempt: 2,
                step_number: 0,
            }),
        ])

        it('puts the children of an agent that failed over under one attempt row each, in order', () => {
            expect(ids(failover.rows)).toEqual([
                'root',
                'attempt:root:1',
                'a1-step',
                'attempt:root:2',
                'a2-step-0',
                'a2-tool',
                'delegate',
                'delegate-step',
            ])
            expect(failover.rows.map((row) => row.depth)).toEqual([
                0, 1, 2, 1, 2, 2, 3, 4,
            ])
        })

        it('keeps the span tree itself free of attempt rows', () => {
            expect(ids(failover.nodes)).toEqual([
                'root',
                'a1-step',
                'a2-step-0',
                'a2-tool',
                'delegate',
                'delegate-step',
            ])
            expect(failover.byId.has('attempt:root:1')).toBe(false)
            expect(failover.rowById.get('attempt:root:1')?.kind).toBe('attempt')
            expect(shape(failover)).toEqual([
                {
                    root: [
                        'a1-step',
                        'a2-step-0',
                        { 'a2-tool': [{ delegate: ['delegate-step'] }] },
                    ],
                },
            ])
        })

        it('tells span ancestors from row ancestors: the first never has an attempt row', () => {
            expect(failover.ancestors('a2-step-0')).toEqual(['root'])
            expect(failover.rowAncestors('a2-step-0')).toEqual([
                'root',
                'attempt:root:2',
            ])
            expect(failover.ancestors('delegate-step')).toEqual([
                'root',
                'a2-tool',
                'delegate',
            ])
            expect(failover.rowAncestors('delegate-step')).toEqual([
                'root',
                'attempt:root:2',
                'a2-tool',
                'delegate',
            ])
            expect(failover.ancestors('attempt:root:1')).toEqual([])
            expect(failover.rowAncestors('attempt:root:1')).toEqual(['root'])
        })

        it('numbers the places within the attempt, and marks what is inside one', () => {
            const second = failover.byId.get('a2-tool')

            expect([second?.position, second?.setSize]).toEqual([2, 2])
            expect(second?.parentId).toBe('root')
            expect(second?.rowParentId).toBe('attempt:root:2')
            expect(failover.byId.get('delegate-step')?.inAttempt).toBe(true)
            expect(failover.byId.get('root')?.inAttempt).toBe(false)

            const group = failover.rowById.get('attempt:root:2')

            expect([group?.position, group?.setSize]).toEqual([2, 2])
        })

        it('says how each attempt ended: the failed one with its failed span, the last one answered', () => {
            const [first, second] = failover.rows.filter(
                (row) => row.kind === 'attempt',
            )

            expect(first).toMatchObject({
                attempt: 1,
                of: 2,
                outcome: 'failed',
            })
            expect(first.kind === 'attempt' && first.failed?.id).toBe('a1-step')
            expect(second).toMatchObject({ attempt: 2, outcome: 'answered' })
        })

        it('calls the last attempt of a failed agent failed, and one that is still going nothing', () => {
            const spans = (status: 'failed' | 'running') => [
                makeAgentSpan('root', { sequence: 1, status }),
                makeStepSpan('s1', {
                    sequence: 2,
                    parent_id: 'root',
                    attempt: 1,
                }),
                makeStepSpan('s2', {
                    sequence: 3,
                    parent_id: 'root',
                    attempt: 2,
                }),
            ]
            const outcomes = (status: 'failed' | 'running') =>
                buildSpanTree(spans(status))
                    .rows.filter((row) => row.kind === 'attempt')
                    .map((row) => row.kind === 'attempt' && row.outcome)

            expect(outcomes('failed')).toEqual([null, 'failed'])
            expect(outcomes('running')).toEqual([null, null])
        })

        it('adds no row for an agent with one attempt', () => {
            const tree = buildSpanTree([
                makeAgentSpan('root', { sequence: 1 }),
                makeStepSpan('a', {
                    sequence: 2,
                    parent_id: 'root',
                    attempt: 2,
                }),
                makeStepSpan('b', {
                    sequence: 3,
                    parent_id: 'root',
                    attempt: 2,
                }),
            ])

            expect(ids(tree.rows)).toEqual(['root', 'a', 'b'])
            expect(tree.rows).toEqual(tree.nodes)
        })

        it('groups a delegated agent by its own children, not by the agent above it', () => {
            const tree = buildSpanTree([
                makeAgentSpan('root', { sequence: 1 }),
                makeToolSpan('ask', { sequence: 2, parent_id: 'root' }),
                makeAgentSpan('inner', { sequence: 3, parent_id: 'ask' }),
                makeStepSpan('i1', {
                    sequence: 4,
                    parent_id: 'inner',
                    attempt: 1,
                }),
                makeStepSpan('i2', {
                    sequence: 5,
                    parent_id: 'inner',
                    attempt: 2,
                }),
            ])

            expect(ids(tree.rows)).toEqual([
                'root',
                'ask',
                'inner',
                'attempt:inner:1',
                'i1',
                'attempt:inner:2',
                'i2',
            ])
            expect(tree.rows.map((row) => row.depth)).toEqual([
                0, 1, 2, 3, 4, 3, 4,
            ])
        })

        it('never groups the children of a span that is not an agent', () => {
            const tree = buildSpanTree([
                makeToolSpan('tool', { sequence: 1 }),
                makeEmbeddingSpan('e1', {
                    sequence: 2,
                    parent_id: 'tool',
                    attempt: 1,
                }),
                makeEmbeddingSpan('e2', {
                    sequence: 3,
                    parent_id: 'tool',
                    attempt: 2,
                }),
            ])

            expect(ids(tree.rows)).toEqual(['tool', 'e1', 'e2'])
        })

        it('hides what is under a collapsed attempt row', () => {
            expect(ids(failover.visible(new Set(['attempt:root:2'])))).toEqual([
                'root',
                'attempt:root:1',
                'a1-step',
                'attempt:root:2',
            ])
        })

        it('shows only the rows to keep, with nothing collapsed, when given a set', () => {
            expect(
                ids(
                    failover.visible(
                        new Set(['root']),
                        new Set(['root', 'attempt:root:1', 'a1-step']),
                    ),
                ),
            ).toEqual(['root', 'attempt:root:1', 'a1-step'])
            expect(ids(failover.visible(new Set(), new Set()))).toEqual([])
        })
    })
})
