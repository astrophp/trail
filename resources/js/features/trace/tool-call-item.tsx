import type { Span } from '@/api/types'
import { Button } from '@/components/ui/button'
import { NamedPayload } from '@/components/telemetry/named-payload'
import { asObject } from '@/lib/payload-access'
import type { JsonValue } from '@/lib/json'

type ToolCallItemProps = {
    span: Span
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
 * One tool call a step asked for: the tool, its arguments, and the span the arguments confirm ran
 * it. Without a span the call is shown as it was asked, with no status and no link.
 */
export function ToolCallItem({
    span,
    index,
    repeated,
    call,
    ran,
    onSelect,
}: ToolCallItemProps) {
    const object = asObject(call)
    const name = typeof object?.name === 'string' ? object.name : null
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
            ) : null}
        </NamedPayload>
    )
}
