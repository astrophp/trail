import { cn } from '@/lib/utils'

type RedactionMarkProps = {
    /** The marker as stored, such as `[redacted]`. */
    text: string
    className?: string
}

/** A redaction marker, highlighted, with a note for screen readers that the value was removed. */
export function RedactionMark({ text, className }: RedactionMarkProps) {
    return (
        <span
            data-slot="redaction"
            title="Redacted before it was stored"
            className={cn(
                'rounded-sm bg-warning-soft px-1 text-warning',
                className,
            )}
        >
            {text}
            <span className="sr-only"> (redacted before it was stored)</span>
        </span>
    )
}
