import type { Trace } from '@/api/types'
import { cn } from '@/lib/utils'

type TraceFlagsProps = {
    trace: Pick<Trace, 'recovered' | 'child_failed'>
    className?: string
}

/** The small notes under a status: the run recovered from a failure, or a child run failed. */
export function TraceFlags({ trace, className }: TraceFlagsProps) {
    if (!trace.recovered && !trace.child_failed) {
        return null
    }

    return (
        <div
            data-slot="trace-flags"
            className={cn('flex flex-col gap-0.75 text-xs', className)}
        >
            {trace.recovered ? (
                <span className="text-warning">Recovered</span>
            ) : null}
            {trace.child_failed ? (
                <span className="text-destructive">Child failed</span>
            ) : null}
        </div>
    )
}
