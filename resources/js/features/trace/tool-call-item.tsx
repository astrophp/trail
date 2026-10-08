import type { Span } from '@/api/types'
import { Button } from '@/components/ui/button'
import type { SpanTree } from '@/features/trace/build-span-tree'
import { NamedPayload } from '@/features/trace/named-payload'
import { asObject } from '@/features/trace/payload-access'
import {
    unlinkedCallWords,
    type RunContext,
} from '@/features/trace/tool-call-status'
import type { JsonValue } from '@/lib/json'

type ToolCallItemProps = {
    span: Span
    tree: SpanTree
    run: RunContext
    /** Its place among the calls the step requested, from 0. */
    index: number
    /** The call's name appears more than once in the step: its place goes into the viewer's name. */
    repeated: boolean
    call: JsonValue
    /** The tool span that ran it; `null` when none can be named. */
    ran: Span | null
    onSelect: (id: string) => void
}

/**
 * One tool call a step asked for: the tool, its arguments, and the span that ran it. Without a span
 * it says what is known (not started, waiting for approval, nothing recorded); a call whose name
 * cannot be read makes no claim.
 */
export function ToolCallItem({
    span,
    tree,
    run,
    index,
    repeated,
    call,
    ran,
    onSelect,
}: ToolCallItemProps) {
    const object = asObject(call)
    const name = typeof object?.name === 'string' ? object.name : null
    const id = typeof object?.id === 'string' ? object.id : null
    const shown = name ?? 'Unnamed'

    return (
        <NamedPayload
            span={span}
            path={
                object === null
                    ? `output.tool_calls.${index}`
                    : `output.tool_calls.${index}.arguments`
            }
            name={shown}
            label={`${repeated ? `call ${index + 1} ` : ''}${shown} arguments`}
            value={object === null ? call : object.arguments}
        >
            {ran !== null ? (
                <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    aria-label={`Open tool span ${ran.name}`}
                    onClick={() => onSelect(ran.id)}
                >
                    Open tool span
                </Button>
            ) : name === null ? null : (
                <span className="text-caption text-muted-foreground">
                    {unlinkedCallWords(span, tree, id, run)}
                </span>
            )}
        </NamedPayload>
    )
}
