import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { useBackLink, useReturnTarget } from '@/hooks/use-return-target'

/** The hook for a page whose address has `from` as its return target. */
function at(from: string | null) {
    const query = from === null ? '' : `?from=${encodeURIComponent(from)}`

    return ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={[`/somewhere${query}`]}>
            {children}
        </MemoryRouter>
    )
}

const target = (from: string | null) =>
    renderHook(() => useReturnTarget(), { wrapper: at(from) }).result.current

describe('the pages a page can lead back to', () => {
    it.each([
        '/traces',
        '/traces?status=failed&page=2',
        '/traces/compare?a=1&b=2',
        '/conversations/transcript?id=c-1',
        '/agents',
        '/agents?range=7d&sort=-cost&search=support',
        '/agents/agent?name=SupportAssistant',
        '/agents/agent?name=a%2Fb%20c%25d%2Be&range=7d',
    ])('accepts %s', (from) => {
        expect(target(from)).toEqual({
            pathname: from.split('?')[0],
            search: from.includes('?') ? `?${from.split('?')[1]}` : '',
        })
    })

    it.each([
        ['an unknown page of the dashboard', '/usage'],
        ['a page below the agent’s', '/agents/agent/extra'],
        ['an agent in the path, which is not where it goes', '/agents/Support'],
        ['the overview', '/'],
        ['another site', 'https://example.com/agents'],
        ['a protocol-relative address', '//example.com/agents'],
        ['a backslash', '/agents\\x'],
        ['a path that climbs', '/agents/../usage'],
        ['a fragment', '/agents#x'],
        ['a return target of its own', '/agents?from=%2Ftraces'],
        ['white space', '/agents?search=a b'],
        ['no path at all', 'agents'],
        ['an empty value', ''],
    ])('rejects %s', (_, from) => {
        expect(target(from)).toBeNull()
    })

    it('has no target without a return parameter', () => {
        expect(target(null)).toBeNull()
    })
})

describe('the way back of a run', () => {
    const back = (from: string | null) =>
        renderHook(() => useBackLink(), { wrapper: at(from) }).result.current

    it('leads to the list of runs it was opened from', () => {
        expect(back('/traces?status=failed')).toMatchObject({
            to: '/traces?status=failed',
            label: 'Back to traces',
            from: '/traces?status=failed',
            source: 'list',
        })
    })

    it('does not lead to the list of agents, which a run is not opened from', () => {
        for (const from of ['/agents', '/agents?range=7d&sort=-cost']) {
            expect(back(from)).toMatchObject({
                to: '/traces',
                label: 'Back to traces',
                from: null,
                source: 'list',
            })
        }
    })

    it('leads back to the agent’s page it was opened from, with its whole view, and has no neighbours', () => {
        const from = '/agents/agent?name=a%2Fb%20c%2Bd&range=7d&chart=cost'

        expect(back(from)).toEqual({
            to: from,
            label: 'Back to agent',
            from: null,
            source: 'agent',
        })
    })
})
