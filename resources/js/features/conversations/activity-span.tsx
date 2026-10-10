import { useBoot } from '@/hooks/use-boot'
import {
    formatClockTime,
    formatDateTime,
    formatDayAndClock,
    formatShortDate,
    isSameDay,
    resolveTimeZone,
} from '@/lib/format'

type ActivitySpanProps = {
    /** ISO 8601, as the API sends it: when the first and the latest turn started. */
    from: string
    to: string
}

/**
 * The time from the first turn's start to the latest turn's start, in the application's time zone:
 * the day and both clock times when they share a day, both whole when they do not. Only a turn
 * starting counts as activity, so the end of the latest turn is not in it.
 */
export function ActivitySpan({ from, to }: ActivitySpanProps) {
    const timeZone = resolveTimeZone(useBoot().timezone)
    const start = new Date(from)
    const end = new Date(to)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return null
    }

    const sameDay = isSameDay(start, end, timeZone)

    return (
        <span data-slot="activity-span" className="tabular-nums">
            <time dateTime={from} title={formatDateTime(start, timeZone)}>
                {sameDay
                    ? `${formatShortDate(start, timeZone)} · ${formatClockTime(start, timeZone)}`
                    : formatDayAndClock(start, timeZone)}
            </time>
            {from === to ? null : (
                <>
                    {' – '}
                    <time dateTime={to} title={formatDateTime(end, timeZone)}>
                        {sameDay
                            ? formatClockTime(end, timeZone)
                            : formatDayAndClock(end, timeZone)}
                    </time>
                </>
            )}
        </span>
    )
}
