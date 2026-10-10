import { PendingApprovalList } from '@/components/telemetry/pending-approval-list'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Pending approval list',
    specimens: [
        {
            name: 'One call with a reason',
            Component: () => (
                <PendingApprovalList
                    approvals={[
                        {
                            tool_call_id: 'toolu_09',
                            tool: 'refund_order',
                            arguments: { order: 1042 },
                            reason: 'Moves money',
                        },
                    ]}
                />
            ),
        },
        {
            name: 'Two calls, one without a reason or arguments',
            Component: () => (
                <PendingApprovalList
                    approvals={[
                        {
                            tool_call_id: 'toolu_09',
                            tool: 'refund_order',
                            arguments: { order: 1042 },
                            reason: null,
                        },
                        {
                            tool_call_id: 'toolu_10',
                            tool: 'send_email',
                            arguments: null,
                            reason: null,
                        },
                    ]}
                />
            ),
        },
    ],
}
