import { describe, expect, it } from 'vitest'
import type { PendingApproval } from '@/api/types'
import { waitingTools } from '@/components/telemetry/waiting-tools'

const approval = (tool: string, id: string): PendingApproval => ({
    tool_call_id: id,
    tool,
    arguments: null,
    reason: null,
})

describe('waitingTools', () => {
    it('names each tool once, in the order it was asked', () => {
        expect(
            waitingTools([
                approval('refund_order', 'a'),
                approval('send_email', 'b'),
                approval('refund_order', 'c'),
            ]),
        ).toEqual(['refund_order', 'send_email'])
    })

    it('is empty when nothing waits', () => {
        expect(waitingTools([])).toEqual([])
    })
})
