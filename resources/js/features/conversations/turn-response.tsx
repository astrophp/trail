import { useState } from 'react'
import type { Turn } from '@/api/types'
import { Notice } from '@/components/patterns/notice'
import { AgentIcon } from '@/components/telemetry/agent-icon'
import { ErrorSummary } from '@/components/telemetry/error-summary'
import { MessageItem } from '@/components/telemetry/message-item'
import { ModelLabel } from '@/components/telemetry/model-label'
import { PendingApprovalList } from '@/components/telemetry/pending-approval-list'
import { Button } from '@/components/ui/button'
import { responseOf } from '@/features/conversations/transcript-turns'
import { waitingTools } from '@/components/telemetry/waiting-tools'

/** What stands where the response would be, for a turn that has none. */
function NoResponse({ turn }: { turn: Turn }) {
    const { trace, detail } = turn
    const [open, setOpen] = useState(false)
    const tools = waitingTools(detail.pending_approvals)

    switch (trace.status) {
        case 'failed':
        case 'incomplete':
            return (
                <div className="flex flex-col gap-2">
                    <p className="text-ui text-muted-foreground">
                        No completed response
                    </p>
                    <ErrorSummary error={detail.error} issueKind={null} />
                </div>
            )
        case 'running':
            return <p className="text-ui text-muted-foreground">In progress</p>
        case 'awaiting_approval':
            return (
                <Notice
                    tone="info"
                    title={
                        tools.length === 0
                            ? 'Waiting for a tool approval'
                            : `Waiting for approval of: ${tools.join(', ')}`
                    }
                    action={
                        tools.length === 0 ? undefined : (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-expanded={open}
                                onClick={() => setOpen(!open)}
                            >
                                {open
                                    ? 'Hide the waiting tool calls'
                                    : 'Show the waiting tool calls'}
                            </Button>
                        )
                    }
                >
                    {open ? (
                        <PendingApprovalList
                            approvals={detail.pending_approvals}
                            className="mt-2"
                        />
                    ) : null}
                </Notice>
            )
        case 'completed':
            return null
    }
}

/**
 * The assistant's side of a turn: the agent and its model, and the response as plain text. A turn
 * that has no response says why it can: how it failed, that it is in progress, or what it waits for.
 */
export function TurnResponse({ turn, number }: { turn: Turn; number: number }) {
    const response = responseOf(turn)

    return (
        <div data-slot="turn-response" className="flex gap-3">
            <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted"
            >
                <AgentIcon type={turn.trace.type} className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <span className="text-xs font-medium wrap-anywhere">
                        {turn.trace.name}
                    </span>
                    <ModelLabel
                        of={turn.trace}
                        layout="inline"
                        className="text-caption"
                    />
                </div>
                {response === undefined ? (
                    <NoResponse turn={turn} />
                ) : (
                    <MessageItem
                        variant="plain"
                        message={response}
                        truncatedPaths={response.truncated_paths}
                        heading={`Turn ${number} response`}
                    />
                )}
            </div>
        </div>
    )
}
