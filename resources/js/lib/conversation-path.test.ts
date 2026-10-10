import { describe, expect, it } from 'vitest'
import {
    conversationPath,
    conversationRunsPath,
    conversationTurnPath,
    transcriptPath,
    withTurn,
} from '@/lib/conversation-path'

describe('conversationPath', () => {
    it('is the conversation’s page with the id in the query', () => {
        expect(conversationPath('conversation-1')).toBe(
            '/conversations/transcript?id=conversation-1',
        )
    })

    it('is the page the route serves', () => {
        expect(conversationPath('x').startsWith(`${transcriptPath}?`)).toBe(
            true,
        )
    })

    it.each([
        ['a/b', 'id=a%2Fb'],
        ['a b', 'id=a+b'],
        ['café', 'id=caf%C3%A9'],
        ['a.b', 'id=a.b'],
        ['a?b#c', 'id=a%3Fb%23c'],
        ['a&b=c', 'id=a%26b%3Dc'],
        ['1+1', 'id=1%2B1'],
        ['100%', 'id=100%25'],
    ])('encodes %j so that it stays one value', (id, expected) => {
        expect(conversationPath(id)).toBe(`${transcriptPath}?${expected}`)
    })

    it.each(['a/b c.é?#%', ' padded ', '1+1', 'a&b=c', '日本語/ü'])(
        'reads back as the id %j',
        (id) => {
            const query = conversationPath(id).split('?')[1]

            expect(new URLSearchParams(query).get('id')).toBe(id)
        },
    )
})

describe('conversationTurnPath', () => {
    it('is the conversation’s page with the id and the turn in the query', () => {
        expect(conversationTurnPath('support/ada 1042', 'run-1')).toBe(
            `${transcriptPath}?id=support%2Fada+1042&turn=run-1`,
        )
    })

    it.each(['a/b c.é?#%', '日本語/ü', '1+1'])(
        'reads back as the id %j and the turn',
        (id) => {
            const query = conversationTurnPath(id, 'r/1 é').split('?')[1]
            const params = new URLSearchParams(query)

            expect(params.get('id')).toBe(id)
            expect(params.get('turn')).toBe('r/1 é')
        },
    )
})

describe('withTurn', () => {
    const from = `${transcriptPath}?id=a%2Fb+c&turn=run-1`

    it('replaces the turn and keeps the rest of the address', () => {
        expect(withTurn(from, 'run-2')).toBe(
            `${transcriptPath}?id=a%2Fb+c&turn=run-2`,
        )
    })

    it('adds the turn to an address that has none, and keeps the other parameters', () => {
        expect(withTurn(`${transcriptPath}?id=x&tools=0`, 'run-2')).toBe(
            `${transcriptPath}?id=x&tools=0&turn=run-2`,
        )
    })

    it('encodes a turn that needs it', () => {
        expect(
            new URLSearchParams(withTurn(from, 'r/2 é&x').split('?')[1]).get(
                'turn',
            ),
        ).toBe('r/2 é&x')
    })

    it('leaves an address that is not the conversation’s page as it was', () => {
        expect(withTurn('/traces?range=7d', 'run-2')).toBe('/traces?range=7d')
    })
})

describe('conversationRunsPath', () => {
    it('is the list of runs filtered to the conversation, with no time range', () => {
        expect(conversationRunsPath('support/ada 1042')).toBe(
            '/traces?conversation=support%2Fada+1042',
        )
    })
})
