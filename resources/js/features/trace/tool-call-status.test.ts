import { describe, expect, it } from 'vitest'
import type { PendingApproval, Status } from '@/api/types'
import { unlinkedCallWords } from '@/features/trace/tool-call-status'

const pending: PendingApproval = {
    tool_call_id: 'call_1',
    tool: 'refund_order',
    arguments: null,
    reason: null,
}

function words(
    status: Status,
    options: { id?: string | null; approvals?: PendingApproval[] } = {},
) {
    return unlinkedCallWords(options.id === undefined ? 'call_1' : options.id, {
        status,
        pendingApprovals: options.approvals ?? [],
    })
}

describe('unlinkedCallWords', () => {
    it('says waiting for approval for a call in the pending approvals of a run that waits', () => {
        expect(words('awaiting_approval', { approvals: [pending] })).toBe(
            'Waiting for approval',
        )
    })

    it('says nothing for another call, a call without an id, or a run that is not waiting', () => {
        expect(
            words('awaiting_approval', {
                approvals: [{ ...pending, tool_call_id: 'other' }],
            }),
        ).toBeNull()
        expect(
            words('awaiting_approval', { id: null, approvals: [pending] }),
        ).toBeNull()
        expect(words('failed', { approvals: [pending] })).toBeNull()
    })

    it.each<Status>(['running', 'completed', 'failed'])(
        'says nothing about whether the call started or ran while the run is %s',
        (status) => {
            expect(words(status)).toBeNull()
        },
    )
})
