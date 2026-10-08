import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatCount } from '@/lib/format'
import { cutPoint, splitOnMarker, textChunk } from '@/lib/json'
import { cn } from '@/lib/utils'

type CappedTextProps = {
    text: string
    /** Text that stands for a removed value; wherever it occurs it is marked as redacted. */
    redactionMarker: string
    /** How many characters are put in the page at a time; the rest is revealed in steps of this size. */
    chunk?: number
    className?: string
}

/**
 * Text exactly as given, wrapped, and never as HTML. Only the first chunk is in the page; a button
 * reveals the next one and says how much is left, so a huge string cannot freeze the browser. A cut
 * never splits a surrogate pair or a redaction marker.
 */
export function CappedText({
    text,
    redactionMarker,
    chunk = textChunk,
    className,
}: CappedTextProps) {
    const [limit, setLimit] = useState(chunk)
    const end =
        text.length > limit
            ? cutPoint(text, limit, redactionMarker)
            : text.length
    const remaining = text.length - end

    return (
        <span
            data-slot="capped-text"
            className={cn('break-words whitespace-pre-wrap', className)}
        >
            {splitOnMarker(text.slice(0, end), redactionMarker).map(
                (part, index) =>
                    part.marker ? (
                        <span
                            key={index}
                            data-slot="redaction"
                            title="Redacted before it was stored"
                            className="rounded-sm bg-warning-soft px-1 text-warning"
                        >
                            {part.text}
                            <span className="sr-only">
                                {' '}
                                (redacted before it was stored)
                            </span>
                        </span>
                    ) : (
                        part.text
                    ),
            )}
            {remaining > 0 ? (
                <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="ml-1 h-auto p-0 font-sans"
                    onClick={() => setLimit(limit + chunk)}
                >
                    Show more ({formatCount(remaining)} characters left)
                </Button>
            ) : null}
        </span>
    )
}
