import { describe, expect, it } from 'vitest'
import type { AgentSubtotal, UsageRow } from '@/api/types'
import { groupUsageRows } from '@/features/trace/group-usage-rows'

const usage = {
    state: 'reported',
    input_tokens: 1,
    output_tokens: 1,
    cache_read_tokens: null,
    cache_write_tokens: null,
    reasoning_tokens: null,
    total_tokens: 2,
} as const

const row = (id: string, agent: string | null): UsageRow => ({
    span_id: id,
    agent_span_id: agent,
    type: 'step',
    name: 'step',
    attempt: 1,
    step_number: 0,
    provider: 'openai',
    model: 'gpt-5',
    usage,
    cost: { state: 'estimated', amount: 0.01 },
})

const agent = (id: string): AgentSubtotal => ({
    span_id: id,
    name: id,
    usage,
    cost: { state: 'estimated', amount: 0.02 },
})

describe('groupUsageRows', () => {
    it('is one group without a subtotal for a run with one agent', () => {
        const rows = [row('a', 'root'), row('b', 'root')]

        expect(groupUsageRows(rows, [agent('root')])).toEqual([
            { key: 'group:all', agent: null, orphan: false, rows },
        ])
    })

    it('is one group for a run without agents, and none without rows', () => {
        expect(groupUsageRows([row('a', null)], [])).toHaveLength(1)
        expect(groupUsageRows([], [agent('x'), agent('y')])).toEqual([])
    })

    it('groups by agent in the order of the subtotals, rows under no agent last', () => {
        const groups = groupUsageRows(
            [
                row('e', null),
                row('a', 'child'),
                row('b', 'root'),
                row('c', 'child'),
            ],
            [agent('root'), agent('child')],
        )

        expect(groups.map((group) => group.key)).toEqual([
            'agent:root',
            'agent:child',
            'group:none',
        ])
        expect(groups[1].rows.map((r) => r.span_id)).toEqual(['a', 'c'])
        expect(groups[1].agent?.span_id).toBe('child')
        expect(groups[2]).toMatchObject({ agent: null, orphan: true })
    })

    it('leaves out an agent that has no rows of its own', () => {
        const groups = groupUsageRows(
            [row('a', 'child')],
            [agent('root'), agent('child')],
        )

        expect(groups.map((group) => group.key)).toEqual(['agent:child'])
    })

    it('keeps its synthetic keys apart from span ids', () => {
        const groups = groupUsageRows(
            [row('a', 'all'), row('b', null)],
            [agent('all'), agent('none')],
        )

        expect(new Set(groups.map((group) => group.key)).size).toBe(2)
    })

    it('puts a row whose agent was not returned with the rows under no agent', () => {
        const groups = groupUsageRows(
            [row('a', 'root'), row('b', 'gone')],
            [agent('root'), agent('child')],
        )

        expect(groups.map((group) => group.key)).toEqual([
            'agent:root',
            'group:none',
        ])
    })
})
