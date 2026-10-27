import { useMemo, useState, type ReactNode } from 'react'
import { CappedText } from '@/components/patterns/capped-text'
import { CopyButton } from '@/components/patterns/copy-button'
import { MarkdownText } from '@/components/patterns/markdown-text'
import { notify } from '@/components/patterns/notify'
import { Notice } from '@/components/patterns/notice'
import { PayloadNode } from '@/components/patterns/payload-node'
import { TextViewSwitch } from '@/components/patterns/text-view-switch'
import { ViewSwitch } from '@/components/patterns/view-switch'
import { useTextView } from '@/hooks/use-text-view'
import { formatCount } from '@/lib/format'
import {
    isContainer,
    prettyJson,
    type JsonObject,
    type JsonValue,
} from '@/lib/json'
import { cn } from '@/lib/utils'

type PayloadViewerProps = {
    /** The stored payload. `undefined` or `null` means nothing was captured. */
    value: JsonValue | undefined
    /** Names the payload, for example `arguments`: the group's name and the copy button's (`Copy arguments`). */
    label: string
    /**
     * Frames the value under this heading: the heading in a header bar with the view switch and
     * the copy button, the value under a line. Without it (or `title`) the controls sit in a bare
     * row, for a value that is already under a label of its own.
     */
    heading?: string
    redacted?: boolean
    truncated?: boolean
    /** How long the value was before it was cut short, in characters. */
    originalLength?: number | null
    /** The words shown beside `Not captured` when there is no value. */
    missingReason?: string
    /** The text that stands for a removed value; it is marked wherever it appears. */
    redactionMarker?: string
    /**
     * A text is shown as running prose, with no box and no copy button, for where the value is
     * the content of a message and the frame is the caller's. A structured value is not affected.
     */
    plain?: boolean
    /**
     * `markdown` draws a text as markdown, with a Rendered/Raw switch beside it; Raw is the text
     * exactly as stored. `json` shows a text that holds a JSON object or array as a tree, with Raw
     * (and copying) giving the text exactly as stored; any other text stays text. A structured
     * value is not affected.
     */
    format?: 'text' | 'markdown' | 'json'
    /**
     * Leaves the Rendered/Raw switch of a markdown text out, for a caller that shows it itself
     * (`TextViewSwitch`): the choice is one for the whole dashboard, so any switch drives it.
     */
    viewSwitch?: boolean
    /**
     * Frames the value like `heading` does, under any title rather than a heading: for a value
     * named by what it belongs to (a tool's name, and what sits beside it). Not used with `plain`.
     */
    title?: ReactNode
    className?: string
}

const box =
    'rounded-lg border bg-muted px-3 py-2.5 font-mono text-caption leading-relaxed'

/** A framed value: its header bar, and its body for structure, for prose and for markdown. */
const frame = 'min-w-0 overflow-hidden rounded-lg border bg-card'
const frameHeader =
    'flex min-w-0 items-center justify-between gap-2 border-b bg-muted/50 py-1 ps-3 pe-1'
const frameBody = 'min-w-0 px-3 py-2.5 font-mono text-xs leading-relaxed'
const frameProse = 'min-w-0 px-4 py-3 font-sans text-ui leading-relaxed'

const headingClass = 'text-xs font-medium text-muted-foreground'

const treeViews = [
    { value: 'tree', label: 'Tree' },
    { value: 'raw', label: 'Raw' },
] as const

type TreeView = (typeof treeViews)[number]['value']

/** Texts longer than this are not read as JSON: they stay text, so a huge one cannot stall the page. */
const jsonTextLimit = 1_000_000

/** The object or array a text holds as JSON, or `null` for any other text and any other value. */
function parseJsonText(
    value: JsonValue | undefined,
): JsonValue[] | JsonObject | null {
    if (typeof value !== 'string' || value.length > jsonTextLimit) {
        return null
    }

    const start = value.trimStart()[0]

    if (start !== '{' && start !== '[') {
        return null
    }

    try {
        const read = JSON.parse(value) as JsonValue

        return isContainer(read) ? read : null
    } catch {
        // Cut short, or not JSON after all: it stays text.
        return null
    }
}

type MarkdownViewsProps = {
    text: string
    redactionMarker: string
    /** The level of the answer's own headings: one below the heading the text sits under. */
    headingLevel: number
}

/**
 * A markdown text in the view chosen. A view stays in the page once it has been shown, so going
 * back to it keeps what was revealed; one never shown is not drawn.
 */
function MarkdownViews({
    text,
    redactionMarker,
    headingLevel,
}: MarkdownViewsProps) {
    const [view] = useTextView()
    const [shown, setShown] = useState({
        rendered: view === 'rendered',
        raw: view === 'raw',
    })

    if (!shown[view]) {
        setShown({ ...shown, [view]: true })
    }

    return (
        <>
            {shown.rendered ? (
                <div hidden={view !== 'rendered'} className="min-w-0">
                    <MarkdownText
                        text={text}
                        redactionMarker={redactionMarker}
                        headingLevel={headingLevel}
                    />
                </div>
            ) : null}
            {shown.raw ? (
                <div hidden={view !== 'raw'} className="min-w-0">
                    <CappedText text={text} redactionMarker={redactionMarker} />
                </div>
            ) : null}
        </>
    )
}

/**
 * One stored payload, shown as received: a string as text, an object or array as a tree with a
 * raw view next to it. Everything is text, never HTML, and a large value is revealed in steps.
 */
export function PayloadViewer({
    value,
    label,
    heading,
    redacted,
    truncated,
    originalLength,
    missingReason,
    redactionMarker = '[redacted]',
    plain = false,
    format = 'text',
    viewSwitch = true,
    title,
    className,
}: PayloadViewerProps) {
    const markdown =
        format === 'markdown' && typeof value === 'string' && value !== ''
            ? value
            : null
    // A text that holds JSON (a tool's result, as the SDK stores it), read once.
    const parsed = useMemo(
        () => (format === 'json' ? parseJsonText(value) : null),
        [format, value],
    )
    const container =
        parsed ?? (value !== undefined && isContainer(value) ? value : null)
    const structured = container !== null
    const [view, setView] = useState<TreeView>('tree')
    const [rawShown, setRawShown] = useState(false)
    // Pretty-printing walks the whole value, so it waits until the Raw view has been opened.
    const raw = useMemo((): { text: string } | { failed: true } | null => {
        if (!rawShown || container === null) {
            return null
        }

        // Raw is what was stored: the text itself when the tree was read from text.
        if (parsed !== null && typeof value === 'string') {
            return { text: value }
        }

        try {
            return { text: prettyJson(container) }
        } catch {
            return { failed: true }
        }
    }, [rawShown, container, parsed, value])

    const notices = (
        <>
            {redacted ? (
                <Notice
                    tone="info"
                    title="Parts of this value were redacted before it was stored."
                />
            ) : null}
            {truncated ? (
                <Notice
                    tone="warning"
                    title="This value was cut short when it was stored."
                >
                    {typeof originalLength === 'number' &&
                    Number.isFinite(originalLength) &&
                    originalLength > 0
                        ? `It was ${formatCount(originalLength)} characters.`
                        : null}
                </Notice>
            ) : null}
        </>
    )

    const framed =
        title ??
        (heading ? <h3 className={headingClass}>{heading}</h3> : undefined)

    if ((value === undefined || value === null) && framed !== undefined) {
        return (
            <div
                data-slot="payload-viewer"
                data-state="missing"
                className={cn('flex min-w-0 flex-col gap-2', className)}
            >
                {notices}
                <div className={frame}>
                    <div
                        data-slot="payload-header"
                        className={cn(frameHeader, 'py-2')}
                    >
                        <div className="min-w-0">{framed}</div>
                    </div>
                    <p className={frameProse}>
                        <span className="text-muted-foreground">
                            Not captured
                        </span>
                        {missingReason ? ` ${missingReason}` : null}
                    </p>
                </div>
            </div>
        )
    }

    if (value === undefined || value === null) {
        return (
            <div
                data-slot="payload-viewer"
                data-state="missing"
                className={cn('flex min-w-0 flex-col gap-2', className)}
            >
                {notices}
                <p className="text-ui">
                    <span className="text-muted-foreground">Not captured</span>
                    {missingReason ? ` ${missingReason}` : null}
                </p>
            </div>
        )
    }

    if (plain && markdown !== null) {
        return (
            <div
                data-slot="payload-viewer"
                data-state="plain"
                role="group"
                aria-label={label}
                className={cn('flex min-w-0 flex-col gap-2', className)}
            >
                {notices}
                {viewSwitch ? (
                    <div className="flex justify-end">
                        <TextViewSwitch label={label} />
                    </div>
                ) : null}
                <div className="text-ui leading-relaxed">
                    <MarkdownViews
                        text={markdown}
                        redactionMarker={redactionMarker}
                        headingLevel={3}
                    />
                </div>
            </div>
        )
    }

    if (plain && typeof value === 'string') {
        return (
            <div
                data-slot="payload-viewer"
                data-state="plain"
                role="group"
                aria-label={label}
                className={cn('flex min-w-0 flex-col gap-2', className)}
            >
                {notices}
                <p className="text-ui leading-relaxed">
                    {value === '' ? (
                        <span className="text-muted-foreground">
                            Empty text
                        </span>
                    ) : (
                        <CappedText
                            text={value}
                            redactionMarker={redactionMarker}
                        />
                    )}
                </p>
            </div>
        )
    }

    // Computed when the button is pressed: a huge value is never stringified just to be shown.
    const copyText = () =>
        typeof value === 'string'
            ? value
            : structured
              ? prettyJson(value)
              : JSON.stringify(value)
    const copy = (
        <CopyButton
            text={copyText}
            label={`Copy ${label}`}
            onCopied={() => notify.success(`Copied ${label}`)}
            onFailed={() => notify.error(`Could not copy ${label}`)}
        />
    )

    const treeSwitch = (
        <ViewSwitch
            label={`${label} view`}
            options={treeViews}
            value={view}
            onValueChange={(next) => {
                setView(next)

                if (next === 'raw') {
                    setRawShown(true)
                }
            }}
        />
    )
    const switches =
        markdown !== null ? (
            viewSwitch ? (
                <TextViewSwitch label={label} />
            ) : null
        ) : structured ? (
            treeSwitch
        ) : null
    // Both views stay mounted once shown, so going back to the tree keeps what was opened.
    const treeViewsShown = (bodyClass: string) => (
        <>
            <div
                data-view="tree"
                hidden={view !== 'tree'}
                className={bodyClass}
            >
                <PayloadNode
                    value={container}
                    rootLabel={label}
                    redactionMarker={redactionMarker}
                />
            </div>
            <div data-view="raw" hidden={view !== 'raw'} className={bodyClass}>
                {raw === null ? null : 'text' in raw ? (
                    <CappedText
                        text={raw.text}
                        redactionMarker={redactionMarker}
                    />
                ) : (
                    <p className="font-sans text-muted-foreground">
                        This value is too large or too deeply nested to show as
                        raw JSON.
                    </p>
                )}
            </div>
        </>
    )
    const text = (value: string) =>
        value === '' ? (
            <span className="font-sans text-muted-foreground">Empty text</span>
        ) : (
            <CappedText text={value} redactionMarker={redactionMarker} />
        )

    if (framed !== undefined) {
        return (
            <div
                data-slot="payload-viewer"
                data-state="framed"
                role="group"
                aria-label={label}
                className={cn('flex min-w-0 flex-col gap-2', className)}
            >
                {notices}
                <div className={frame}>
                    <div data-slot="payload-header" className={frameHeader}>
                        <div className="min-w-0">{framed}</div>
                        <div className="flex shrink-0 items-center gap-1">
                            {switches}
                            {copy}
                        </div>
                    </div>
                    {markdown !== null ? (
                        <div className={cn(frameProse, 'py-4')}>
                            <MarkdownViews
                                text={markdown}
                                redactionMarker={redactionMarker}
                                headingLevel={heading ? 4 : 3}
                            />
                        </div>
                    ) : structured ? (
                        treeViewsShown(frameBody)
                    ) : typeof value === 'string' ? (
                        // A text named by its section reads as prose; one named by a tool as code.
                        <div
                            className={
                                title === undefined ? frameProse : frameBody
                            }
                        >
                            {text(value)}
                        </div>
                    ) : (
                        <div className={frameBody}>
                            <PayloadNode
                                value={value}
                                redactionMarker={redactionMarker}
                            />
                        </div>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div
            data-slot="payload-viewer"
            role="group"
            aria-label={label}
            className={cn('flex min-w-0 flex-col gap-2', className)}
        >
            {notices}
            {markdown !== null || structured ? (
                <>
                    <div className="flex items-center justify-end gap-1">
                        {switches}
                        {copy}
                    </div>
                    {markdown !== null ? (
                        <div className={cn(box, 'min-w-0 font-sans')}>
                            <MarkdownViews
                                text={markdown}
                                redactionMarker={redactionMarker}
                                headingLevel={3}
                            />
                        </div>
                    ) : (
                        treeViewsShown(cn(box, 'min-w-0'))
                    )}
                </>
            ) : (
                <div className="flex items-start gap-2">
                    <div className={cn(box, 'min-w-0 flex-1')}>
                        {typeof value === 'string' ? (
                            text(value)
                        ) : (
                            <PayloadNode
                                value={value}
                                redactionMarker={redactionMarker}
                            />
                        )}
                    </div>
                    {copy}
                </div>
            )}
        </div>
    )
}
