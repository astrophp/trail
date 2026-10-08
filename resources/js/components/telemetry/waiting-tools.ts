import type { PendingApproval } from '@/api/types'

/** The tools a run waits on a decision for, in the order they were asked and without repeats. */
export function waitingTools(approvals: readonly PendingApproval[]): string[] {
    return [...new Set(approvals.map((approval) => approval.tool))]
}
