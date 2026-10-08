import { describe, expect, it } from 'vitest'
import type { Span } from '@/api/types'
import {
    matchToolCalls,
    type RequestedCall,
} from '@/features/trace/match-tool-calls'
import type { JsonValue } from '@/lib/json'
import { makeAgentSpan, makeStepSpan, makeToolSpan } from '@/test/trace-api'

const ids = (spans: ReturnType<typeof matchToolCalls>) =>
    spans.map((span) => span?.id ?? null)

const call = (name: string | null, args?: JsonValue): RequestedCall => ({
    name,
    arguments: args,
})

const step = (sequence = 2, overrides: Partial<Span> = {}) =>
    makeStepSpan('s0', {
        sequence,
        parent_id: 'root',
        step_number: 0,
        ...overrides,
    })

const next = (sequence: number, overrides: Partial<Span> = {}) =>
    makeStepSpan('s1', {
        sequence,
        parent_id: 'root',
        step_number: 1,
        ...overrides,
    })

/** A tool span of the agent; `args` of `undefined` is a span that stored no input. */
const tool = (
    id: string,
    sequence: number,
    name: string,
    args?: JsonValue,
    overrides: Partial<Span> = {},
) =>
    makeToolSpan(id, {
        sequence,
        parent_id: 'root',
        name,
        input: args === undefined ? null : { arguments: args },
        ...overrides,
    })

describe('matchToolCalls', () => {
    it('links each call to the tool span that ran it when the arguments agree', () => {
        const spans = [
            step(),
            tool('t-a', 3, 'search', { q: 1 }),
            tool('t-b', 4, 'lookup', { id: 7 }),
            next(5),
        ]

        expect(
            ids(
                matchToolCalls(
                    spans[0],
                    [call('lookup', { id: 7 }), call('search', { q: 1 })],
                    spans,
                ),
            ),
        ).toEqual(['t-b', 't-a'])
    })

    it('ignores the order of keys when it compares arguments', () => {
        const spans = [step(), tool('t', 3, 'search', { a: 1, b: 2 }), next(4)]

        expect(
            ids(
                matchToolCalls(
                    spans[0],
                    [call('search', { b: 2, a: 1 })],
                    spans,
                ),
            ),
        ).toEqual(['t'])
    })

    it('links only the second of two calls of a tool when only the second ran', () => {
        const spans = [step(), tool('only', 3, 'search', { q: 'B' }), next(4)]

        expect(
            ids(
                matchToolCalls(
                    spans[0],
                    [call('search', { q: 'A' }), call('search', { q: 'B' })],
                    spans,
                ),
            ),
        ).toEqual([null, 'only'])
    })

    it('links candidates that were recorded out of call order by their arguments', () => {
        const spans = [
            step(),
            tool('second', 3, 'search', { q: 'B' }),
            tool('first', 4, 'search', { q: 'A' }),
            next(5),
        ]

        expect(
            ids(
                matchToolCalls(
                    spans[0],
                    [call('search', { q: 'A' }), call('search', { q: 'B' })],
                    spans,
                ),
            ),
        ).toEqual(['first', 'second'])
    })

    it('pairs two calls with equal arguments with their two spans, in order', () => {
        const spans = [
            step(),
            tool('one', 3, 'search', { q: 'A' }),
            tool('two', 4, 'search', { q: 'A' }),
            next(5),
        ]

        expect(
            ids(
                matchToolCalls(
                    spans[0],
                    [call('search', { q: 'A' }), call('search', { q: 'A' })],
                    spans,
                ),
            ),
        ).toEqual(['one', 'two'])
    })

    it('makes no link when the arguments disagree, however the counts stand', () => {
        const spans = [step(), tool('t', 3, 'search', { q: 'other' }), next(4)]

        expect(
            ids(matchToolCalls(spans[0], [call('search', { q: 'A' })], spans)),
        ).toEqual([null])
    })

    it('makes no link when two unpaired spans equal the arguments and position cannot tell them apart', () => {
        const spans = [
            step(),
            tool('x', 3, 'search', { q: 'A' }),
            tool('y', 4, 'search', { q: 'A' }),
            next(5),
        ]

        // One call of the name, two equal candidates: the positional one is taken, the other left.
        expect(
            ids(matchToolCalls(spans[0], [call('search', { q: 'A' })], spans)),
        ).toEqual(['x'])
    })

    it('takes a span that stored no input by position when the counts of the name are equal', () => {
        const spans = [
            step(),
            tool('one', 3, 'search'),
            tool('two', 4, 'search'),
            next(5),
        ]

        expect(
            ids(
                matchToolCalls(
                    spans[0],
                    [call('search', { q: 'A' }), call('search', { q: 'B' })],
                    spans,
                ),
            ),
        ).toEqual(['one', 'two'])
    })

    it('makes no link for spans that stored no input when the counts of the name differ', () => {
        const spans = [step(), tool('one', 3, 'search'), next(4)]

        expect(
            ids(
                matchToolCalls(
                    spans[0],
                    [call('search', { q: 'A' }), call('search', { q: 'B' })],
                    spans,
                ),
            ),
        ).toEqual([null, null])
    })

    it('keeps the attempts of a failover apart', () => {
        const spans = [
            step(2, { attempt: 1 }),
            tool('a1', 3, 'search', { q: 1 }, { attempt: 1 }),
            tool('a2', 5, 'search', { q: 1 }, { attempt: 2 }),
        ]

        expect(
            ids(matchToolCalls(spans[0], [call('search', { q: 1 })], spans)),
        ).toEqual(['a1'])
    })

    it('leaves out the tools of a delegated agent that run between the step and the next one', () => {
        const spans = [
            makeAgentSpan('root', { sequence: 1 }),
            step(),
            makeToolSpan('ask', {
                sequence: 3,
                parent_id: 'root',
                name: 'ask',
                input: { arguments: { who: 'research' } },
            }),
            makeAgentSpan('child', { sequence: 4, parent_id: 'ask' }),
            makeToolSpan('inner', {
                sequence: 5,
                parent_id: 'child',
                name: 'search',
                input: { arguments: { q: 1 } },
            }),
            tool('mine', 6, 'search', { q: 1 }),
            next(7),
        ]

        expect(
            ids(
                matchToolCalls(
                    spans[1],
                    [
                        call('ask', { who: 'research' }),
                        call('search', { q: 1 }),
                    ],
                    spans,
                ),
            ),
        ).toEqual(['ask', 'mine'])
    })

    it('does not look past the next step of the same agent', () => {
        const spans = [step(), next(3), tool('later', 4, 'search', { q: 1 })]

        expect(
            ids(matchToolCalls(spans[0], [call('search', { q: 1 })], spans)),
        ).toEqual([null])
    })

    it('links nothing for a call without a readable name, and does not let it shift the others', () => {
        const spans = [step(), tool('t', 3, 'search', { q: 1 }), next(4)]

        expect(
            ids(
                matchToolCalls(
                    spans[0],
                    [call(null), call('search', { q: 1 })],
                    spans,
                ),
            ),
        ).toEqual([null, 't'])
    })

    it('links nothing for a call that stored no arguments to compare, unless the span stored none either and the counts agree', () => {
        const spans = [step(), tool('t', 3, 'search', { q: 1 }), next(4)]

        expect(ids(matchToolCalls(spans[0], [call('search')], spans))).toEqual([
            null,
        ])
    })

    it('links no tool span to a step that requested none, and a call the run never reached', () => {
        const spans = [step(), next(3)]

        expect(ids(matchToolCalls(spans[0], [], spans))).toEqual([])
        expect(
            ids(matchToolCalls(spans[0], [call('search', { q: 1 })], spans)),
        ).toEqual([null])
    })
})
