import { useBoot } from '@/hooks/use-boot'
import {
    formatClockTime,
    formatDayAndClock,
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
    /**
     * `stacked` is how long ago with the clock time under it; `inline` is the day and the clock
     * time on one line (`Oct 7 \u00b7 14:03:22`), for a header that states when a run started;
     * `full` is the whole date and time with its zone on one line, with how long ago on hover.
     */
    layout?: 'stacked' | 'inline' | 'full'
    className?: string
}

/**
 * When something happened: how long ago, and the clock time under it, in the application's time
 * zone. The full date and time with its zone are on hover and in the accessible text. It is
 * computed on render and does not tick: a page refreshes its data, and the time with it.
 */
export function Timestamp({
    at,
    now = new Date(),
    layout = 'stacked',
    className,
}: TimestampProps) {
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

    if (layout === 'full') {
        return (
            <time
                data-slot="timestamp"
                dateTime={at}
                title={formatRelativeTime(date, now)}
                className={cn('tabular-nums', className)}
            >
                {absolute}
            </time>
        )
    }

    if (layout === 'inline') {
        return (
            <time
                data-slot="timestamp"
                dateTime={at}
                title={absolute}
                className={cn('tabular-nums', className)}
            >
                <span aria-hidden="true">
                    {formatDayAndClock(date, timeZone)}
                </span>
                <span className="sr-only">{absolute}</span>
            </time>
        )
    }

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
