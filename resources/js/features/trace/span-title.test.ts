import { describe, expect, it } from 'vitest'
import { spanSubtitle, spanTitle } from '@/features/trace/span-title'

describe('spanTitle', () => {
    it('numbers a step from 1 though it is stored from 0', () => {
        expect(spanTitle({ type: 'step', name: 'step', step_number: 0 })).toBe(
            'Model step 1',
        )
        expect(spanTitle({ type: 'step', name: 'step', step_number: 2 })).toBe(
            'Model step 3',
        )
    })

    it('does not invent a number for a step without one', () => {
        expect(
            spanTitle({ type: 'step', name: 'step', step_number: null }),
        ).toBe('Model step')
    })

    it.each(['agent', 'tool', 'embedding'] as const)(
        'is the name of a %s',
        (type) => {
            expect(spanTitle({ type, name: 'Thing', step_number: null })).toBe(
                'Thing',
            )
        },
    )
})

describe('spanSubtitle', () => {
    it('is the model of a step or an embedding, in monospace', () => {
        for (const type of ['step', 'embedding'] as const) {
            expect(spanSubtitle({ type, model: 'gpt-x' }, true)).toEqual({
                text: 'gpt-x',
                mono: true,
            })
        }
    })

    it('says so when the model was not captured', () => {
        expect(spanSubtitle({ type: 'step', model: null }, true)).toEqual({
            text: 'Not captured',
            mono: false,
        })
    })

    it('calls a tool a tool call', () => {
        expect(spanSubtitle({ type: 'tool', model: null }, true).text).toBe(
            'Tool call',
        )
    })

    it('tells an agent run from a delegated agent', () => {
        expect(spanSubtitle({ type: 'agent', model: 'm' }, false).text).toBe(
            'Agent run',
        )
        expect(spanSubtitle({ type: 'agent', model: 'm' }, true).text).toBe(
            'Delegated agent',
        )
    })
})
