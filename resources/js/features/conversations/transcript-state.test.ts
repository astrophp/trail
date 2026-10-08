import { describe, expect, it } from 'vitest'
import {
    fromWindow,
    isRunning,
    withEarlier,
    withLater,
    withRefreshed,
} from '@/features/conversations/transcript-state'
import { turnOf, windowOf } from '@/test/transcript-api'

const ids = (turns: { trace: { id: string } }[]) =>
    turns.map((turn) => turn.trace.id)

const gone = (turns = [turnOf('x')]) => {
    const response = windowOf(turns)

    return {
        ...response,
        window: {
            ...response.window,
            anchor: { param: 'turn' as const, id: 'old', found: false },
        },
    }
}

describe('fromWindow', () => {
    it('takes the turns and the counts outside them from the answer', () => {
        const data = fromWindow(
            windowOf([turnOf('a'), turnOf('b')], { older: 4, newer: 2 }),
        )

        expect(ids(data.turns)).toEqual(['a', 'b'])
        expect([data.older, data.newer, data.missing]).toEqual([4, 2, null])
    })

    it('names the turn that was asked for and is not there', () => {
        expect(fromWindow(gone()).missing).toBe('old')
    })

    it('has no missing turn for one that was found', () => {
        const found = windowOf([turnOf('a')])
        found.window.anchor = { param: 'turn', id: 'a', found: true }

        expect(fromWindow(found).missing).toBeNull()
    })
})

describe('withEarlier and withLater', () => {
    const held = fromWindow(
        windowOf([turnOf('c'), turnOf('d')], { older: 12, newer: 3 }),
    )

    it('puts an earlier window before the turns held and takes its count of older ones', () => {
        const data = withEarlier(
            held,
            windowOf([turnOf('a'), turnOf('b')], { older: 10, newer: 5 }),
        )

        expect(ids(data.turns)).toEqual(['a', 'b', 'c', 'd'])
        // What lies after is still the newest window's count, not the earlier answer's.
        expect([data.older, data.newer]).toEqual([10, 3])
    })

    it('puts a later window after the turns held and takes its count of newer ones', () => {
        const data = withLater(
            held,
            windowOf([turnOf('e'), turnOf('f')], { older: 14, newer: 1 }),
        )

        expect(ids(data.turns)).toEqual(['c', 'd', 'e', 'f'])
        expect([data.older, data.newer]).toEqual([12, 1])
    })

    it('lists a turn that two windows hold once', () => {
        expect(
            ids(withLater(held, windowOf([turnOf('d'), turnOf('e')])).turns),
        ).toEqual(['c', 'd', 'e'])
        expect(
            ids(withEarlier(held, windowOf([turnOf('b'), turnOf('c')])).turns),
        ).toEqual(['b', 'c', 'd'])
    })

    it('changes nothing for an answer about a turn that is gone', () => {
        expect(withEarlier(held, gone())).toBe(held)
        expect(withLater(held, gone())).toBe(held)
    })
})

describe('withRefreshed', () => {
    const running = (id: string) => turnOf(id, { trace: { status: 'running' } })
    const held = fromWindow(
        windowOf([turnOf('a'), running('b')], { older: 3, newer: 0 }),
    )

    it('replaces a turn by id and leaves the others as they were', () => {
        const done = turnOf('b', { trace: { status: 'completed' } })
        const data = withRefreshed(held, [windowOf([done])], null)

        expect(data.turns[0]).toBe(held.turns[0])
        expect(data.turns[1]).toBe(done)
        expect(isRunning(data.turns[1])).toBe(false)
        expect([data.older, data.newer]).toEqual([3, 0])
    })

    it('takes the conversation’s figures from the answers', () => {
        const answer = windowOf([turnOf('b')], {
            conversation: { id: 'support/ada 1042', user_count: 9 },
        })

        expect(
            withRefreshed(held, [answer], null).conversation.user_count,
        ).toBe(9)
    })

    it('appends the turns after the last one, in order, with the count still to come', () => {
        const data = withRefreshed(
            held,
            [],
            windowOf([turnOf('c'), turnOf('d')], { older: 5, newer: 7 }),
        )

        expect(ids(data.turns)).toEqual(['a', 'b', 'c', 'd'])
        expect(data.newer).toBe(7)
        expect(data.older).toBe(3)
    })

    it('does not put another turn in the place of one that is gone', () => {
        const data = withRefreshed(held, [gone([turnOf('zzz')])], null)

        expect(data.turns).toEqual(held.turns)
        expect(data.conversation).toBe(held.conversation)
    })

    it('ignores a later window that is not the one after the last turn', () => {
        const data = withRefreshed(held, [], gone([turnOf('zzz')]))

        expect(ids(data.turns)).toEqual(['a', 'b'])
    })

    it('does not add a turn an answer holds that is not loaded', () => {
        const data = withRefreshed(held, [windowOf([turnOf('q')])], null)

        expect(ids(data.turns)).toEqual(['a', 'b'])
    })
})
