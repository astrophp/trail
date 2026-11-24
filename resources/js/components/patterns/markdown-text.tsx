import { useMemo, useState } from 'react'
import { Markdown } from '@/components/patterns/markdown'
import { Button } from '@/components/ui/button'
import { formatCount } from '@/lib/format'
import { textChunk } from '@/lib/json'
import {
    blockCutPoint,
    referenceDefinitions,
    sentinelFor,
} from '@/lib/markdown'
import { cn } from '@/lib/utils'

type MarkdownTextProps = {
    text: string
    /** Text that stands for a removed value; wherever it occurs it is marked as redacted. */
    redactionMarker: string
    /** About how many characters are put in the page at a time; the rest is revealed in steps of this size. */
    chunk?: number
    /** The level of the answer's top headings; see `Markdown`. */
    headingLevel?: number
    className?: string
}

/**
 * A markdown text drawn in parts, the counterpart of `CappedText`: only the first part is in the
 * page, and a button reveals the next one and says how much is left. Parts end between blocks
 * where the text allows it, never inside a code fence, and each part is parsed once.
 */
export function MarkdownText({
    text,
    redactionMarker,
    chunk = textChunk,
    headingLevel,
    className,
}: MarkdownTextProps) {
    const sentinel = useMemo(() => sentinelFor(text), [text])
    // Each part is parsed on its own, so every part gets the link definitions of the whole text.
    const definitions = useMemo(() => {
        const found = referenceDefinitions(text)

        return found.length === 0 ? '' : `\n\n${found.join('\n')}`
    }, [text])
    const [ends, setEnds] = useState(() => [
        blockCutPoint(text, 0, chunk, redactionMarker),
    ])
    const end = ends[ends.length - 1]
    const remaining = text.length - end

    return (
        <div
            data-slot="markdown-text"
            className={cn('flex min-w-0 flex-col gap-3', className)}
        >
            {ends.map((partEnd, index) => (
                <Markdown
                    key={index}
                    text={
                        text.slice(index === 0 ? 0 : ends[index - 1], partEnd) +
                        definitions
                    }
                    redactionMarker={redactionMarker}
                    sentinel={sentinel}
                    headingLevel={headingLevel}
                />
            ))}
            {remaining > 0 ? (
                <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="h-auto self-start p-0 font-sans"
                    onClick={() =>
                        setEnds([
                            ...ends,
                            blockCutPoint(text, end, chunk, redactionMarker),
                        ])
                    }
                >
                    Show more ({formatCount(remaining)} characters left)
                </Button>
            ) : null}
        </div>
    )
}
