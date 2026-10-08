import { describe, expect, it } from 'vitest'
import { conversationPath } from '@/lib/conversation-path'

describe('conversationPath', () => {
    it('is the conversation’s page for a plain id', () => {
        expect(conversationPath('conversation-1')).toBe(
            '/conversations/conversation-1',
        )
    })

    it.each([
        ['a/b', '/conversations/a%2Fb'],
        ['a b', '/conversations/a%20b'],
        ['café', '/conversations/caf%C3%A9'],
        ['a.b', '/conversations/a.b'],
        ['a?b#c', '/conversations/a%3Fb%23c'],
        ['100%', '/conversations/100%25'],
    ])('keeps %j as one path segment', (id, expected) => {
        expect(conversationPath(id)).toBe(expected)
    })

    it('decodes back to the id', () => {
        const id = 'a/b c.é?#%'

        expect(
            decodeURIComponent(
                conversationPath(id).slice('/conversations/'.length),
            ),
        ).toBe(id)
    })
})
