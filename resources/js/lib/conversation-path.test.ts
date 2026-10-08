import { describe, expect, it } from 'vitest'
import { conversationPath, transcriptPath } from '@/lib/conversation-path'

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
