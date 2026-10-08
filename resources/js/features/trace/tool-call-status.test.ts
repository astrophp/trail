import { describe, expect, it } from 'vitest'
import type { PendingApproval, Status } from '@/api/types'
import { buildSpanTree } from '@/features/trace/build-span-tree'
import { unlinkedCallWords } from '@/features/trace/tool-call-status'
import { makeAgentSpan, makeStepSpan } from '@/test/trace-api'

const pending: PendingApproval = {
    tool_call_id: 'call_1',
    tool: 'refund_order',
    arguments: null,
    reason: null,
}

function words(
    status: Status,
    options: {
        agent?: Status
        id?: string | null
        approvals?: PendingApproval[]
    } = {},
) {
    const spans = [
        makeAgentSpan('root', {
            sequence: 1,
            status: options.agent ?? 'completed',
        }),
        makeStepSpan('s', { sequence: 2, parent_id: 'root', step_number: 0 }),
    ]
    const tree = buildSpanTree(spans)

    return unlinkedCallWords(
        spans[1],
        tree,
        options.id === undefined ? 'call_1' : options.id,
        { status, pendingApprovals: options.approvals ?? [] },
    )
}

describe('unlinkedCallWords', () => {
    it('says not started yet while the run is running', () => {
        expect(words('running')).toBe('Not started yet')
    })

    it("says not started yet while the step's agent is running, though the run has another status", () => {
        expect(words('failed', { agent: 'running' })).toBe('Not started yet')
    })

    it('says waiting for approval for a call in the pending approvals of a run that waits', () => {
        expect(words('awaiting_approval', { approvals: [pending] })).toBe(
            'Waiting for approval',
        )
    })

    it('does not say that for another call, a call without an id, or a run that is not waiting', () => {
        const none = 'No tool span was recorded for this call'

        expect(
            words('awaiting_approval', {
                approvals: [{ ...pending, tool_call_id: 'other' }],
            }),
        ).toBe(none)
        expect(
            words('awaiting_approval', { id: null, approvals: [pending] }),
        ).toBe(none)
        expect(words('failed', { approvals: [pending] })).toBe(none)
    })

    it('otherwise says no tool span was recorded', () => {
        expect(words('completed')).toBe(
            'No tool span was recorded for this call',
        )
    })
})
