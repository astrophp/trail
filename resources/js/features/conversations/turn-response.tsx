import { useState, type ReactNode } from 'react'
import type { Turn } from '@/api/types'
import { Notice } from '@/components/patterns/notice'
import { Panel } from '@/components/patterns/panel'
import { PanelFooter } from '@/components/patterns/panel-footer'
import { AgentIcon } from '@/components/telemetry/agent-icon'
import { ErrorSummary } from '@/components/telemetry/error-summary'
import { MessageItem } from '@/components/telemetry/message-item'
import { ModelLabel } from '@/components/telemetry/model-label'
import { PendingApprovalList } from '@/components/telemetry/pending-approval-list'
import { TextViewSwitch } from '@/components/patterns/text-view-switch'
import { Button } from '@/components/ui/button'
import { responseOf } from '@/features/conversations/transcript-turns'
import { asObject } from '@/lib/payload-access'
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

type TurnResponseProps = {
    turn: Turn
    number: number
    /** What closes the card: the turn's figures and the way to its trace. */
    footer?: ReactNode
}

/**
 * The agent's side of a turn, in a white card of its own: a header with a square avatar of the
 * agent's icon, the agent and its model and the Rendered/Raw switch; a line; the response drawn
 * as markdown at full width; and the turn's figures at its foot. A turn that has no response says why it can: how it
 * failed, that it is in progress, or what it waits for.
 */
export function TurnResponse({ turn, number, footer }: TurnResponseProps) {
    const response = responseOf(turn)
    const answer = response === undefined ? null : asObject(response)
    // The switch sits on the agent's line when there is an answer to draw as markdown.
    const drawn =
        answer?.role === 'assistant' &&
        typeof answer.content === 'string' &&
        answer.content !== ''
    const heading = `Turn ${number} response`

    return (
        <Panel data-slot="turn-response" className="min-w-0">
            <div className="flex min-w-0 items-center justify-between gap-2 border-b px-5 py-4">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span
                        aria-hidden="true"
                        className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"
                    >
                        <AgentIcon
                            type={turn.trace.type}
                            className="size-3.5"
                        />
                    </span>
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
                </div>
                {drawn ? (
                    <TextViewSwitch label={heading} className="shrink-0" />
                ) : null}
            </div>
            <div className="min-w-0 p-5">
                {response === undefined ? (
                    <NoResponse turn={turn} />
                ) : (
                    <MessageItem
                        variant="plain"
                        message={response}
                        truncatedPaths={response.truncated_paths}
                        heading={heading}
                        markdown
                        viewSwitch={false}
                    />
                )}
            </div>
            {footer === undefined ? null : (
                <PanelFooter className="border-t">{footer}</PanelFooter>
            )}
        </Panel>
    )
}
