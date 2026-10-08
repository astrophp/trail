import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

type MoreCountProps = {
    /** How many there are beyond those named. */
    count: number
    /** What is counted, singular: `user`, `agent`. */
    noun: string
    className?: string
}

/** "+3" after a short list that leaves some out, with the same in words for assistive technology. */
export function MoreCount({ count, noun, className }: MoreCountProps) {
    if (count <= 0) {
        return null
    }

    return (
        <span
            data-slot="more-count"
            className={cn(
                'shrink-0 text-caption text-muted-foreground',
                className,
            )}
        >
            <span aria-hidden="true">+{formatCount(count)}</span>
            <span className="sr-only">
                and {formatCount(count)} more {count === 1 ? noun : `${noun}s`}
            </span>
        </span>
    )
}
