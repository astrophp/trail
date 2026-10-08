import { describe, expect, it } from 'vitest'
import {
    numberTurns,
    promptStart,
} from '@/features/conversations/transcript-turns'
import { message, turnOf, windowOf } from '@/test/transcript-api'

describe('numberTurns', () => {
    it('numbers from the turns before the earliest window', () => {
        const pages = [
            windowOf([turnOf('a'), turnOf('b')], { older: 10 }),
            windowOf([turnOf('c')], { older: 12 }),
        ]

        expect(
            numberTurns(pages).map((n) => [n.turn.trace.id, n.number]),
        ).toEqual([
            ['a', 11],
            ['b', 12],
            ['c', 13],
        ])
    })

    it('lists a turn that two windows hold once', () => {
        const pages = [
            windowOf([turnOf('a'), turnOf('b')], { older: 0 }),
            windowOf([turnOf('b'), turnOf('c')], { older: 1 }),
        ]

        expect(numberTurns(pages).map((n) => n.turn.trace.id)).toEqual([
            'a',
            'b',
            'c',
        ])
    })

    it('is empty with no window', () => {
        expect(numberTurns([])).toEqual([])
    })
})

describe('promptStart', () => {
    it('is the prompt’s text, or null without one', () => {
        expect(promptStart(turnOf('a'))).toBe('Question of a')
        expect(
            promptStart(turnOf('a', { messages: [message('response', 'x')] })),
        ).toBeNull()
    })
})
