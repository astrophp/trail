import { describe, expect, it } from 'vitest'
import { buildSpanTree } from '@/features/trace/build-span-tree'
import { resolveSelection } from '@/features/trace/resolve-selection'
import { makeAgentSpan, makeStepSpan, makeToolSpan } from '@/test/trace-api'

// The root and a delegated agent failed because a tool did; a later step failed on its own.
const tree = buildSpanTree([
    makeAgentSpan('root', { sequence: 1, status: 'failed' }),
    makeStepSpan('ok', { sequence: 2, parent_id: 'root' }),
    makeToolSpan('tool', {
        sequence: 3,
        parent_id: 'root',
        status: 'failed',
    }),
    makeAgentSpan('child', {
        sequence: 4,
        parent_id: 'tool',
        status: 'failed',
    }),
    makeToolSpan('deep-tool', {
        sequence: 5,
        parent_id: 'child',
        status: 'failed',
    }),
    makeStepSpan('late-step', {
        sequence: 6,
        parent_id: 'root',
        status: 'failed',
    }),
])

describe('resolveSelection', () => {
    it("is the URL's span when the run has it", () => {
        expect(resolveSelection(tree, 'ok', 'failed')).toBe('ok')
        expect(resolveSelection(tree, 'ok', 'completed')).toBe('ok')
    })

    it('is where the failure started: the first failed span with no failed span under it', () => {
        // Not the root, nor the tool and the agent that failed because of what is below them.
        expect(resolveSelection(tree, '', 'failed')).toBe('deep-tool')
    })

    it('is the failed step when a step is what failed', () => {
        const stepFailed = buildSpanTree([
            makeAgentSpan('root', { sequence: 1, status: 'failed' }),
            makeStepSpan('ok', { sequence: 2, parent_id: 'root' }),
            makeStepSpan('bad', {
                sequence: 3,
                parent_id: 'root',
                status: 'failed',
            }),
        ])

        expect(resolveSelection(stepFailed, '', 'failed')).toBe('bad')
    })

    it('is the earliest by sequence when several failures started independently', () => {
        const two = buildSpanTree([
            makeAgentSpan('root', { sequence: 1, status: 'failed' }),
            makeToolSpan('later', {
                sequence: 5,
                parent_id: 'root',
                status: 'failed',
            }),
            makeStepSpan('earlier', {
                sequence: 3,
                parent_id: 'root',
                status: 'failed',
            }),
        ])

        expect(resolveSelection(two, '', 'failed')).toBe('earlier')
    })

    it('is the root when only the root failed', () => {
        const onlyRoot = buildSpanTree([
            makeAgentSpan('root', { sequence: 1, status: 'failed' }),
            makeStepSpan('ok', { sequence: 2, parent_id: 'root' }),
        ])

        expect(resolveSelection(onlyRoot, '', 'failed')).toBe('root')
    })

    it('is the first top-level span on a run that did not fail', () => {
        expect(resolveSelection(tree, '', 'completed')).toBe('root')
        expect(resolveSelection(tree, '', 'running')).toBe('root')
    })

    it('is the first top-level span on a failed run in which no span failed', () => {
        const calm = buildSpanTree([makeAgentSpan('root', { sequence: 1 })])

        expect(resolveSelection(calm, '', 'failed')).toBe('root')
    })

    it('falls back to the default for a span the run does not have', () => {
        expect(resolveSelection(tree, 'missing', 'completed')).toBe('root')
        expect(resolveSelection(tree, 'missing', 'failed')).toBe('deep-tool')
    })

    it('is null for a run without spans', () => {
        expect(resolveSelection(buildSpanTree([]), '', 'failed')).toBeNull()
    })
})

describe('resolveSelection with attempt rows', () => {
    const failover = buildSpanTree([
        makeAgentSpan('root', { sequence: 1 }),
        makeStepSpan('a', { sequence: 2, parent_id: 'root', attempt: 1 }),
        makeStepSpan('b', {
            sequence: 3,
            parent_id: 'root',
            attempt: 2,
            status: 'failed',
        }),
    ])

    it('never selects an attempt row, whether the URL names one or the failure is found', () => {
        expect(resolveSelection(failover, 'attempt:root:1', 'completed')).toBe(
            'root',
        )
        expect(resolveSelection(failover, '', 'failed')).toBe('b')
        expect(resolveSelection(failover, 'a', 'completed')).toBe('a')
    })
})
