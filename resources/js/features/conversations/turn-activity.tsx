import { ChevronDownIcon, WrenchIcon } from 'lucide-react'
import { useState } from 'react'
import type { Turn } from '@/api/types'
import { Panel } from '@/components/patterns/panel'
import { MessageItem } from '@/components/telemetry/message-item'
import { Button } from '@/components/ui/button'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ToolChip } from '@/features/conversations/tool-chip'
import { activityOf } from '@/features/conversations/transcript-turns'
import { formatCount } from '@/lib/format'
import type { JsonValue } from '@/lib/json'
import { cn } from '@/lib/utils'

type TurnActivityProps = {
    turn: Turn
    number: number
    /** The tool calls are shown as chips. */
    tools: boolean
    /** The conversation's page at this turn: where the run's page leads back to. */
    pagePath: string
    /** A chip's link is followed. */
    onVisit: () => void
}

/** `1 tool call`, `3 tool calls`. */
const counted = (count: number, noun: string) =>
    `${formatCount(count)} ${noun}${count === 1 ? '' : 's'}`

/**
 * What the agent did between the prompt and the answer, as a compact card set apart from the two
 * messages. One line: how many tool calls and messages the activity holds on the left, the calls
 * as chips (each linked to its span, with how it ended) and the switch for the messages on the
 * right. Shown, every message of the activity follows as it was stored, one row each.
 */
export function TurnActivity({
    turn,
    number,
    tools,
    pagePath,
    onVisit,
}: TurnActivityProps) {
    const [open, setOpen] = useState(false)
    const messages = activityOf(turn)
    const calls = messages.flatMap((message) => message.tool_calls ?? [])
    const chips = tools && calls.length > 0

    if (messages.length === 0) {
        return null
    }

    return (
        <Collapsible
            open={open}
            onOpenChange={setOpen}
            data-slot="turn-activity"
            asChild
        >
            <Panel className="min-w-0">
                {/* One line until the messages are shown: what happened on the left, the calls on the right. */}
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <span className="inline-flex items-center gap-1.5 text-ui font-medium">
                            <WrenchIcon
                                aria-hidden="true"
                                className="size-3.5 text-muted-foreground"
                            />
                            Agent activity
                        </span>
                        <span className="text-caption text-muted-foreground">
                            {calls.length > 0
                                ? `${counted(calls.length, 'tool call')} · `
                                : null}
                            {counted(messages.length, 'message')}
                        </span>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                        {chips ? (
                            <ul
                                aria-label="Tool calls"
                                className="flex min-w-0 flex-wrap justify-end gap-1.5"
                            >
                                {calls.map((call, index) => (
                                    <li key={index} className="flex min-w-0">
                                        <ToolChip
                                            call={call}
                                            traceId={turn.trace.id}
                                            from={pagePath}
                                            onVisit={onVisit}
                                        />
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                        <CollapsibleTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                className="shrink-0 text-muted-foreground"
                            >
                                {open ? 'Hide messages' : 'Show messages'}
                                <ChevronDownIcon
                                    aria-hidden="true"
                                    className={cn(open && 'rotate-180')}
                                />
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                </div>
                <CollapsibleContent>
                    <ol
                        aria-label={`Activity of turn ${number}`}
                        className="flex flex-col divide-y border-t"
                    >
                        {messages.map((message, index) => (
                            <MessageItem
                                key={index}
                                message={message as JsonValue}
                                truncatedPaths={message.truncated_paths}
                                heading={`Message ${index + 1}`}
                                label={`turn ${number} message ${index + 1}`}
                                // A row of the card: the line between rows replaces the rule beside it.
                                className="border-s-0 p-5 ps-5"
                            />
                        ))}
                    </ol>
                </CollapsibleContent>
            </Panel>
        </Collapsible>
    )
}
