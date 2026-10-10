import { describe, expect, it } from 'vitest'
import {
    numberTurns,
    promptStart,
} from '@/features/conversations/transcript-turns'
import { message, turnOf } from '@/test/transcript-api'

describe('numberTurns', () => {
    it('numbers from the turns before the first one loaded', () => {
        expect(
            numberTurns([turnOf('a'), turnOf('b'), turnOf('c')], 10).map(
                (n) => [n.turn.trace.id, n.number],
            ),
        ).toEqual([
            ['a', 11],
            ['b', 12],
            ['c', 13],
        ])
    })

    it('starts at 1 when nothing came before', () => {
        expect(numberTurns([turnOf('a')], 0)[0].number).toBe(1)
    })

    it('is empty with no turn', () => {
        expect(numberTurns([], 5)).toEqual([])
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
