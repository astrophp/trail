import type { PendingApproval, Span, Status } from '@/api/types'
import type { SpanTree } from '@/features/trace/build-span-tree'

/** What the page knows about the run that a span cannot say for itself. */
export type RunContext = {
    status: Status
    pendingApprovals: readonly PendingApproval[]
}

/**
 * What to say about a tool call that has no tool span, by what is known: the run (or the agent
 * that asked) is still going, the call is waiting for approval, or nothing was recorded for it.
 * The call's id is `null` when it stored none.
 */
export function unlinkedCallWords(
    step: Pick<Span, 'parent_id'>,
    tree: SpanTree,
    callId: string | null,
    run: RunContext,
): string {
    const agent =
        step.parent_id === null ? undefined : tree.byId.get(step.parent_id)

    if (agent?.span.status === 'running' || run.status === 'running') {
        return 'Not started yet'
    }

    if (
        run.status === 'awaiting_approval' &&
        callId !== null &&
        run.pendingApprovals.some((item) => item.tool_call_id === callId)
    ) {
        return 'Waiting for approval'
    }

    return 'No tool span was recorded for this call'
}
