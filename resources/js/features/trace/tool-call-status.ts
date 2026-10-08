import type { PendingApproval, Status } from '@/api/types'

/** What the page knows about the run that a span cannot say for itself. */
export type RunContext = {
    status: Status
    pendingApprovals: readonly PendingApproval[]
}

/**
 * What to say about a tool call that has no tool span. Having no span is not a finding about the
 * call: it may have run, and the arguments simply did not confirm which span was it. So nothing is
 * said about whether it started, ran or failed. The one thing the run itself records is that the
 * call is among its pending approvals, and that is said; otherwise `null`. The call's id is `null`
 * when it stored none.
 */
export function unlinkedCallWords(
    callId: string | null,
    run: RunContext,
): string | null {
    if (
        run.status === 'awaiting_approval' &&
        callId !== null &&
        run.pendingApprovals.some((item) => item.tool_call_id === callId)
    ) {
        return 'Waiting for approval'
    }

    return null
}
