import { describe, expect, it } from 'vitest'
import { agentPagePath, agentPath } from '@/lib/agent-path'

const nameOf = (path: string) =>
    new URLSearchParams(path.split('?')[1]).get('name')

describe('agentPath', () => {
    it('is the agent’s page with the name in the query', () => {
        expect(agentPath('SupportAssistant')).toBe(
            '/agents/agent?name=SupportAssistant',
        )
        expect(agentPath('x').startsWith(`${agentPagePath}?`)).toBe(true)
    })

    it.each([
        ['a/b', 'name=a%2Fb'],
        ['two words', 'name=two%20words'],
        ['100%', 'name=100%25'],
        ['c++', 'name=c%2B%2B'],
        ['a/b c%d+e', 'name=a%2Fb%20c%25d%2Be'],
        ['café', 'name=caf%C3%A9'],
        ['a?b#c&d=e', 'name=a%3Fb%23c%26d%3De'],
        ['../x', 'name=..%2Fx'],
    ])('encodes %s so that it never reaches the path', (name, query) => {
        const path = agentPath(name)

        expect(path).toBe(`${agentPagePath}?${query}`)
        expect(nameOf(path)).toBe(name)
        // Only the page's own segments are in the path.
        expect(path.split('?')[0]).toBe(agentPagePath)
    })

    it('leaves the default range out, and carries any other', () => {
        expect(agentPath('a', { range: '24h' })).toBe('/agents/agent?name=a')
        expect(agentPath('a', { range: '1h' })).toBe(
            '/agents/agent?name=a&range=1h',
        )
        expect(agentPath('a', { range: '7d' })).toBe(
            '/agents/agent?name=a&range=7d',
        )
    })

    it('carries the list it was opened from, encoded, after the range', () => {
        const from = '/agents?range=7d&sort=-cost&search=a b+c'
        const path = agentPath('a/b', { range: '7d', from })

        expect(path).toBe(
            `/agents/agent?name=a%2Fb&range=7d&from=${encodeURIComponent(from)}`,
        )

        const query = new URLSearchParams(path.split('?')[1])

        expect(query.get('name')).toBe('a/b')
        expect(query.get('from')).toBe(from)
    })
})
