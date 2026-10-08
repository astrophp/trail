import { useMemo, useState } from 'react'
import { CappedText } from '@/components/patterns/capped-text'
import { CopyButton } from '@/components/patterns/copy-button'
import { notify } from '@/components/patterns/notify'
import { Notice } from '@/components/patterns/notice'
import { PayloadNode } from '@/components/patterns/payload-node'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCount } from '@/lib/format'
import { isContainer, prettyJson, type JsonValue } from '@/lib/json'
import { cn } from '@/lib/utils'

type PayloadViewerProps = {
    /** The stored payload. `undefined` or `null` means nothing was captured. */
    value: JsonValue | undefined
    /** Names the payload, for example `arguments`: the group's name and the copy button's (`Copy arguments`). */
    label: string
    /**
     * Shows the viewer's own label row above the value: this text on the left, the copy button
     * (and for a structured value the Tree/Raw switch) on the right. Without it the controls sit
     * in a bare row, for a value that is already under a label of its own.
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
    className?: string
}

const box =
    'rounded-lg border bg-muted px-3 py-2.5 font-mono text-caption leading-relaxed'

/** The block of a value under its own heading: roomier, prose in the UI size, structure in monospace. */
const roomyBox = 'rounded-lg border bg-muted p-4 leading-relaxed'
const textBox = `${roomyBox} font-sans text-ui`
const structuredBox = `${roomyBox} font-mono text-xs`

const headingClass = 'text-xs font-medium text-muted-foreground'

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
    className,
}: PayloadViewerProps) {
    const container = value !== undefined && isContainer(value) ? value : null
    const structured = container !== null
    const [view, setView] = useState('tree')
    const [rawShown, setRawShown] = useState(false)
    // Pretty-printing walks the whole value, so it waits until the Raw view has been opened.
    const raw = useMemo((): { text: string } | { failed: true } | null => {
        if (!rawShown || container === null) {
            return null
        }

        try {
            return { text: prettyJson(container) }
        } catch {
            return { failed: true }
        }
    }, [rawShown, container])

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

    if (value === undefined || value === null) {
        return (
            <div
                data-slot="payload-viewer"
                data-state="missing"
                className={cn('flex min-w-0 flex-col gap-2', className)}
            >
                {notices}
                {heading ? <h3 className={headingClass}>{heading}</h3> : null}
                <p className="text-ui">
                    <span className="text-muted-foreground">Not captured</span>
                    {missingReason ? ` ${missingReason}` : null}
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

    return (
        <div
            data-slot="payload-viewer"
            role="group"
            aria-label={label}
            className={cn('flex min-w-0 flex-col gap-2', className)}
        >
            {notices}
            {structured ? (
                <Tabs
                    value={view}
                    onValueChange={(next) => {
                        setView(next)

                        if (next === 'raw') {
                            setRawShown(true)
                        }
                    }}
                    className="min-w-0 gap-2"
                >
                    <div className="flex items-center justify-between gap-2">
                        {heading ? (
                            <h3 className={headingClass}>{heading}</h3>
                        ) : null}
                        <div className="flex items-center gap-1">
                            <TabsList aria-label={`${label} view`}>
                                <TabsTrigger value="tree">Tree</TabsTrigger>
                                <TabsTrigger value="raw">Raw</TabsTrigger>
                            </TabsList>
                            {heading ? copy : null}
                        </div>
                        {heading ? null : copy}
                    </div>
                    {/* Both panels stay mounted, so going back to the tree keeps what was opened. */}
                    <TabsContent
                        value="tree"
                        forceMount
                        hidden={view !== 'tree'}
                        className={cn(heading ? structuredBox : box, 'min-w-0')}
                    >
                        <PayloadNode
                            value={value}
                            rootLabel={label}
                            redactionMarker={redactionMarker}
                        />
                    </TabsContent>
                    <TabsContent
                        value="raw"
                        forceMount
                        hidden={view !== 'raw'}
                        className={cn(heading ? structuredBox : box, 'min-w-0')}
                    >
                        {raw === null ? null : 'text' in raw ? (
                            <CappedText
                                text={raw.text}
                                redactionMarker={redactionMarker}
                            />
                        ) : (
                            <p className="font-sans text-muted-foreground">
                                This value is too large or too deeply nested to
                                show as raw JSON.
                            </p>
                        )}
                    </TabsContent>
                </Tabs>
            ) : (
                <>
                    {heading ? (
                        <div className="flex items-center justify-between gap-2">
                            <h3 className={headingClass}>{heading}</h3>
                            {copy}
                        </div>
                    ) : null}
                    <div
                        className={cn(
                            'flex gap-2',
                            heading ? 'flex-col' : 'items-start',
                        )}
                    >
                        <div
                            className={cn(
                                heading
                                    ? typeof value === 'string'
                                        ? textBox
                                        : structuredBox
                                    : box,
                                'min-w-0 flex-1',
                            )}
                        >
                            {typeof value === 'string' ? (
                                value === '' ? (
                                    <span className="font-sans text-muted-foreground">
                                        Empty text
                                    </span>
                                ) : (
                                    <CappedText
                                        text={value}
                                        redactionMarker={redactionMarker}
                                    />
                                )
                            ) : (
                                <PayloadNode
                                    value={value}
                                    redactionMarker={redactionMarker}
                                />
                            )}
                        </div>
                        {heading ? null : copy}
                    </div>
                </>
            )}
        </div>
    )
}
