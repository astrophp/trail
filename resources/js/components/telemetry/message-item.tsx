import type { Span } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { NamedPayload } from '@/components/telemetry/named-payload'
import { asArray, asObject, isAbsent } from '@/lib/payload-access'
import { SectionLabel } from '@/components/telemetry/section-label'
import { StoredPayload } from '@/components/telemetry/stored-payload'
import { formatCount } from '@/lib/format'
import type { JsonValue } from '@/lib/json'

type MessageItemProps = {
    span: Span
    /** Where the message is in the stored list. */
    index: number
    /** Its place in the whole history, counted from 1: the stored list may start part way in. */
    number: number
    message: JsonValue
}

type Entry = {
    name: string
    /** Where the value sits in the span: the item's own path when the item is not an object. */
    path: string
    value: JsonValue | undefined
    /** Names the viewer: the message, the call's place when the name repeats, the tool and what the value is. */
    label: string
}

/** The calls or results inside a message that carry a name and a payload under `field`. */
function entriesOf(
    list: JsonValue | undefined,
    listPath: string,
    field: string,
    prefix: string,
    kind: string,
): Entry[] | null {
    const items = asArray(list)

    if (items === null) {
        return null
    }

    const names = items.map((item) => {
        const name = asObject(item)?.name

        return typeof name === 'string' ? name : 'Unnamed'
    })

    return items.map((item, index) => {
        const object = asObject(item)
        const name = names[index]
        const repeated = names.filter((other) => other === name).length > 1

        return {
            name,
            path:
                object === null
                    ? `${listPath}.${index}`
                    : `${listPath}.${index}.${field}`,
            value: object === null ? item : object[field],
            label: `${prefix}${repeated ? `call ${index + 1} ` : ''}${name} ${kind}`,
        }
    })
}

/**
 * One message that was sent, as stored: its role as the SDK named it, its text, the tool calls
 * it made, the tool results it carries and its attachments. Nothing is worked out from the text.
 */
export function MessageItem({
    span,
    index,
    number,
    message,
}: MessageItemProps) {
    const base = `input.messages.${index}`
    const object = asObject(message)
    const heading = `Message ${formatCount(number)}`

    if (object === null) {
        return (
            <li
                data-slot="message-item"
                aria-label={heading}
                className="flex flex-col gap-3 border-s ps-4"
            >
                <div className="flex items-center gap-2">
                    <Badge variant="outline">Unknown role</Badge>
                    <span className="text-caption text-muted-foreground">
                        {heading}
                    </span>
                </div>
                <StoredPayload
                    span={span}
                    path={base}
                    label={heading.toLowerCase()}
                    value={message}
                />
            </li>
        )
    }

    const content = object.content
    const prefix = `${heading.toLowerCase()} `
    const calls = entriesOf(
        object.tool_calls,
        `${base}.tool_calls`,
        'arguments',
        prefix,
        'arguments',
    )
    const results = entriesOf(
        object.tool_results,
        `${base}.tool_results`,
        'result',
        prefix,
        'result',
    )

    return (
        <li
            data-slot="message-item"
            aria-label={heading}
            className="flex min-w-0 flex-col gap-3 border-s ps-4"
        >
            <div className="flex items-center gap-2">
                <Badge variant="outline">
                    {typeof object.role === 'string'
                        ? object.role
                        : 'Unknown role'}
                </Badge>
                <span className="text-caption text-muted-foreground">
                    {heading}
                </span>
            </div>
            {isAbsent(content) || content === '' ? null : (
                <StoredPayload
                    span={span}
                    path={`${base}.content`}
                    label={`${heading.toLowerCase()} text`}
                    value={content}
                />
            )}
            {calls === null || calls.length === 0 ? null : (
                <div className="flex flex-col gap-3">
                    <SectionLabel as="p">Tool calls</SectionLabel>
                    {calls.map((call, i) => (
                        <NamedPayload
                            key={i}
                            span={span}
                            path={call.path}
                            name={call.name}
                            label={call.label}
                            value={call.value}
                        />
                    ))}
                </div>
            )}
            {results === null || results.length === 0 ? null : (
                <div className="flex flex-col gap-3">
                    <SectionLabel as="p">Tool results</SectionLabel>
                    {results.map((result, i) => (
                        <NamedPayload
                            key={i}
                            span={span}
                            path={result.path}
                            name={result.name}
                            label={result.label}
                            value={result.value}
                        />
                    ))}
                </div>
            )}
            {isAbsent(object.attachments) ? null : (
                <div className="flex flex-col gap-3">
                    <SectionLabel as="p">Attachments</SectionLabel>
                    <StoredPayload
                        span={span}
                        path={`${base}.attachments`}
                        label={`${heading.toLowerCase()} attachments`}
                        value={object.attachments}
                    />
                </div>
            )}
        </li>
    )
}
