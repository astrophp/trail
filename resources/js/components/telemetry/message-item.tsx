import { cva } from 'class-variance-authority'
import { Badge } from '@/components/ui/badge'
import { NamedPayload } from '@/components/telemetry/named-payload'
import { asArray, asObject, isAbsent } from '@/lib/payload-access'
import { SectionLabel } from '@/components/telemetry/section-label'
import { StoredPayload } from '@/components/telemetry/stored-payload'
import type { JsonValue } from '@/lib/json'
import { cn } from '@/lib/utils'

/**
 * How the message is framed. `section` is a labelled item of a list, with its role (the run page's
 * step input, and the transcript's expanded activity); `bubble` is a soft bordered box with the
 * text running plain in it (a prompt in the transcript); `plain` is the same text with no frame
 * (a response in the transcript).
 */
export type MessageVariant = 'section' | 'bubble' | 'plain'

const frame = cva('flex min-w-0 flex-col gap-3', {
    variants: {
        variant: {
            section: 'border-s ps-4',
            bubble: 'rounded-lg rounded-ss-none border bg-muted px-4 py-3',
            plain: '',
        },
    },
})

type MessageItemProps = {
    /** The message as stored or returned: an object with a role, text, tool calls, results and attachments. */
    message: JsonValue
    /**
     * The cut parts that are known, by path. On the run page these are the span's own and
     * `basePath` says where the message sits in them; in a transcript they are already relative to
     * the message and `basePath` is left out.
     */
    truncatedPaths: Record<string, number>
    /** Where the message is in the paths of `truncatedPaths` (`input.messages.2`); empty when they are relative to it. */
    basePath?: string
    /** Names the message in a `section` (`Message 3`), and by default what its viewers are called. */
    heading?: string
    /** What the viewers are called, when the heading is not the right name for them. */
    label?: string
    variant?: MessageVariant
    className?: string
}

/** `base.rest`, with an empty base or rest leaving the other as it is. */
function at(base: string, rest: string): string {
    return base === '' ? rest : rest === '' ? base : `${base}.${rest}`
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
 * One message, as stored: its role as the SDK named it, its text, the tool calls it made, the tool
 * results it carries, its structured output and its attachments. Nothing is worked out from the
 * text. Every part is shown through the stored-payload viewers, so a long text is capped, and a
 * part that was cut short or redacted is marked.
 */
export function MessageItem({
    message,
    truncatedPaths,
    basePath = '',
    heading = 'Message',
    label,
    variant = 'section',
    className,
}: MessageItemProps) {
    const cuts = { truncated_paths: truncatedPaths }
    const section = variant === 'section'
    const Tag = section ? 'li' : 'div'
    const names = (label ?? heading).toLowerCase()
    const plain = !section
    const object = asObject(message)
    const identity = {
        'data-slot': 'message-item',
        'aria-label': section ? heading : undefined,
    }

    if (object === null) {
        return (
            <Tag
                {...identity}
                className={cn(
                    section
                        ? 'flex flex-col gap-3 border-s ps-4'
                        : frame({ variant }),
                    className,
                )}
            >
                {section ? (
                    <div className="flex items-center gap-2">
                        <Badge variant="outline">Unknown role</Badge>
                        <span className="text-caption text-muted-foreground">
                            {heading}
                        </span>
                    </div>
                ) : null}
                <StoredPayload
                    span={cuts}
                    path={basePath}
                    label={names}
                    value={message}
                    plain={plain}
                />
            </Tag>
        )
    }

    const content = object.content
    const prefix = `${names} `
    const calls = entriesOf(
        object.tool_calls,
        at(basePath, 'tool_calls'),
        'arguments',
        prefix,
        'arguments',
    )
    const results = entriesOf(
        object.tool_results,
        at(basePath, 'tool_results'),
        'result',
        prefix,
        'result',
    )

    // A prompt or a response with no text and nothing else says so, rather than showing an empty frame.
    const nothing =
        !section &&
        (isAbsent(content) || content === '') &&
        isAbsent(object.structured) &&
        (calls === null || calls.length === 0) &&
        (results === null || results.length === 0) &&
        isAbsent(object.attachments)

    return (
        <Tag {...identity} className={cn(frame({ variant }), className)}>
            {section ? (
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
            ) : null}
            {nothing ? (
                <p className="text-ui text-muted-foreground">
                    {content === '' ? 'Empty text' : 'No text'}
                </p>
            ) : null}
            {isAbsent(content) || content === '' ? null : (
                <StoredPayload
                    span={cuts}
                    path={at(basePath, 'content')}
                    label={`${names} text`}
                    value={content}
                    plain={plain}
                />
            )}
            {section || isAbsent(object.structured) ? null : (
                <StoredPayload
                    span={cuts}
                    path={at(basePath, 'structured')}
                    label={`${names} structured output`}
                    value={object.structured}
                />
            )}
            {calls === null || calls.length === 0 ? null : (
                <div className="flex flex-col gap-3">
                    <SectionLabel as="p">Tool calls</SectionLabel>
                    {calls.map((call, i) => (
                        <NamedPayload
                            key={i}
                            span={cuts}
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
                            span={cuts}
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
                        span={cuts}
                        path={at(basePath, 'attachments')}
                        label={`${names} attachments`}
                        value={object.attachments}
                    />
                </div>
            )}
        </Tag>
    )
}
