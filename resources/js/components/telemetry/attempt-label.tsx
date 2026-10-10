import { cn } from '@/lib/utils'

type AttemptLabelProps = {
    /** The attempt of the run the span belongs to, counted from 1. */
    attempt: number
    /** How many attempts the run made. */
    of: number
    className?: string
}

/** Which failover attempt a span belongs to. A run with one attempt, or a pair that makes no sense, shows none. */
export function AttemptLabel({ attempt, of, className }: AttemptLabelProps) {
    if (
        !Number.isInteger(attempt) ||
        !Number.isInteger(of) ||
        of <= 1 ||
        attempt < 1 ||
        attempt > of
    ) {
        return null
    }

    return (
        <span
            data-slot="attempt-label"
            className={cn(
                'text-caption whitespace-nowrap text-muted-foreground',
                className,
            )}
        >
            Attempt {attempt} of {of}
        </span>
    )
}
