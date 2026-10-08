import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PendingApprovalList } from '@/components/telemetry/pending-approval-list'

describe('PendingApprovalList', () => {
    it('shows each waiting call with its tool, id, reason and arguments', () => {
        render(
            <PendingApprovalList
                approvals={[
                    {
                        tool_call_id: 'toolu_09',
                        tool: 'refund_order',
                        arguments: { order: 1042 },
                        reason: 'Moves money',
                    },
                    {
                        tool_call_id: 'toolu_10',
                        tool: 'send_email',
                        arguments: null,
                        reason: null,
                    },
                ]}
            />,
        )

        const [first, second] = screen.getAllByRole('listitem')

        expect(within(first).getByText('refund_order')).toBeInTheDocument()
        expect(within(first).getByText('toolu_09')).toBeInTheDocument()
        expect(within(first).getByText('Moves money')).toBeInTheDocument()
        expect(within(second).getByText('send_email')).toBeInTheDocument()
        expect(within(second).queryByText('Reason')).not.toBeInTheDocument()
        expect(within(second).getByText('Not captured')).toBeInTheDocument()
    })
})
