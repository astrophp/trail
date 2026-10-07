import { shortId } from '@/lib/format'
import { cn } from '@/lib/utils'

type TraceIdProps = {
    id: string
    className?: string
}

/** A run's id, shortened to fit a table. The whole id is on hover and in the accessible text. */
export function TraceId({ id, className }: TraceIdProps) {
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
