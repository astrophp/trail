import { ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'
import type { Turn } from '@/api/types'
import { MessageItem } from '@/components/telemetry/message-item'
import { Button } from '@/components/ui/button'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ToolChip } from '@/features/conversations/tool-chip'
import { activityOf } from '@/features/conversations/transcript-turns'
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

/**
 * What the agent did between the messages: its tool calls as chips, in order, and beneath them a
 * disclosure of every message of that activity as it was stored.
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

    if (messages.length === 0) {
        return null
    }

    return (
        <Collapsible
            open={open}
            onOpenChange={setOpen}
            data-slot="turn-activity"
            className="ms-10 flex flex-col gap-2"
        >
            {tools && calls.length > 0 ? (
                <ul aria-label="Tool calls" className="flex flex-wrap gap-1.5">
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
                    className="-ms-2 self-start text-muted-foreground"
                >
                    {open ? 'Hide messages' : 'Show messages'}
                    <ChevronDownIcon
                        aria-hidden="true"
                        className={cn(open && 'rotate-180')}
                    />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <ol
                    aria-label={`Activity of turn ${number}`}
                    className="flex flex-col gap-4 pt-1"
                >
                    {messages.map((message, index) => (
                        <MessageItem
                            key={index}
                            message={message as JsonValue}
                            truncatedPaths={message.truncated_paths}
                            heading={`Message ${index + 1}`}
                            label={`turn ${number} message ${index + 1}`}
                        />
                    ))}
                </ol>
            </CollapsibleContent>
        </Collapsible>
    )
}
