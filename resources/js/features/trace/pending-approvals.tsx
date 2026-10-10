import type { PendingApproval } from '@/api/types'
import { PendingApprovalList } from '@/components/telemetry/pending-approval-list'
import { RunPanel } from '@/features/trace/run-panel'

type PendingApprovalsProps = {
    approvals: PendingApproval[]
}

/** The tool calls a paused run waits for a decision on. */
export function PendingApprovals({ approvals }: PendingApprovalsProps) {
    return (
        <RunPanel title="Pending approvals">
            <p className="text-ui text-muted-foreground">
                A run that resumes after approval is recorded as a separate run.
            </p>
            <PendingApprovalList approvals={approvals} />
        </RunPanel>
    )
}
