import { shortId } from '@/lib/format'
import { cn } from '@/lib/utils'

type TraceIdProps = {
    id: string
    /** Show the whole id, which wraps rather than overflows, for where it is the point of the line. */
    full?: boolean
    className?: string
}

/** A run's id, shortened to fit a table. The whole id is on hover and in the accessible text. */
export function TraceId({ id, full = false, className }: TraceIdProps) {
    if (full) {
        return (
            <span
                data-slot="trace-id"
                className={cn(
                    'font-mono text-caption wrap-anywhere text-faint',
                    className,
                )}
            >
                {id}
            </span>
        )
    }

    return (
        <span
            data-slot="trace-id"
            title={id}
            className={cn('font-mono text-caption text-faint', className)}
        >
            <span aria-hidden="true">{shortId(id)}</span>
            <span className="sr-only">{id}</span>
        </span>
    )
}
