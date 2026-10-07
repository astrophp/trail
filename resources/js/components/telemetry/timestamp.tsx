import { useBoot } from '@/hooks/use-boot'
import {
    formatClockTime,
    formatDateTime,
    formatRelativeTime,
    formatShortDate,
    isSameDay,
    resolveTimeZone,
} from '@/lib/format'
import { cn } from '@/lib/utils'

type TimestampProps = {
    /** An ISO 8601 date-time, as the API sends it. */
    at: string
    /** What "ago" is measured from. Tests pass a fixed time. */
    now?: Date
    className?: string
}

/**
 * When something happened: how long ago, and the clock time under it, in the application's time
 * zone. The full date and time with its zone are on hover and in the accessible text. It is
 * computed on render and does not tick: a page refreshes its data, and the time with it.
 */
export function Timestamp({ at, now = new Date(), className }: TimestampProps) {
    const timeZone = resolveTimeZone(useBoot().timezone)
    const date = new Date(at)

    if (Number.isNaN(date.getTime())) {
        return (
            <span
                data-slot="timestamp"
                className={cn('text-muted-foreground', className)}
            >
                Not captured
            </span>
        )
    }

    const absolute = formatDateTime(date, timeZone)
    const clock = formatClockTime(date, timeZone)

    return (
        <time
            data-slot="timestamp"
            dateTime={at}
            title={absolute}
            className={cn('flex flex-col', className)}
        >
            <span aria-hidden="true" className="tabular-nums">
                {formatRelativeTime(date, now)}
            </span>
            <span
                aria-hidden="true"
                className="mt-1 font-mono text-caption text-faint"
            >
                {isSameDay(date, now, timeZone)
                    ? clock
                    : `${formatShortDate(date, timeZone)} · ${clock}`}
            </span>
            <span className="sr-only">{absolute}</span>
        </time>
    )
}
