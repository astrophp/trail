import { cva } from 'class-variance-authority'
import type { Span, Status } from '@/api/types'
import { formatDuration, formatOffset } from '@/lib/format'
import { cn } from '@/lib/utils'

// Status is never colour alone: a failed bar has a hard end cap, an incomplete one is dashed and
// hollow, one awaiting approval is outlined, and a running one fades out where it is still open.
const bar = cva('absolute inset-y-0 min-w-1.5', {
    variants: {
        status: {
            completed: 'rounded-sm bg-primary',
            failed: 'rounded-l-sm border-r-2 border-foreground bg-destructive',
            incomplete:
                'rounded-sm border border-dashed border-warning bg-warning-soft',
            awaiting_approval:
                'rounded-sm border border-primary-ink bg-primary-soft',
            running:
                'rounded-l-sm bg-linear-to-r from-info to-transparent motion-safe:animate-pulse',
        },
    },
})

const outcomes: Record<Exclude<Status, 'running'>, string> = {
    completed: 'took',
    failed: 'failed after',
    incomplete: 'incomplete after',
    awaiting_approval: 'awaiting approval after',
}

const capitalise = (text: string) =>
    text.charAt(0).toUpperCase() + text.slice(1)

type TimingBarProps = {
    span: Pick<Span, 'offset_ms' | 'duration_ms' | 'status'>
    /** The length of the axis the bar is drawn on, in milliseconds. Decided by the caller. */
    axisMs: number | null
    /** Lets a row name the bar in `aria-describedby`, which reads its sentence even where the bar is hidden. */
    id?: string
    className?: string
}

// Six decimals: enough that a tiny real duration keeps a width, without floating point noise.
const percent = (value: number) => `${Number((value * 100).toFixed(6))}%`

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1)

// From this far along the axis an open bar is held to the right edge, where its minimum width shows.
const nearEnd = 0.95

/**
 * One span's position and length on a run's time axis, drawn only from its own offset and duration.
 * A span that is still running is open-ended; one without a duration has no bar at all, and neither
 * has one drawn on an axis that is not usable. A number that is not finite (or a negative duration)
 * is treated as not captured: it is never drawn and never written out.
 */
export function TimingBar({ span, axisMs, id, className }: TimingBarProps) {
    const { status } = span
    const offset = Number.isFinite(span.offset_ms) ? span.offset_ms : null
    const duration =
        span.duration_ms !== null &&
        Number.isFinite(span.duration_ms) &&
        span.duration_ms >= 0
            ? span.duration_ms
            : null
    const axis =
        axisMs !== null && Number.isFinite(axisMs) && axisMs > 0 ? axisMs : null
    const starts = offset === null ? null : `Starts at ${formatOffset(offset)}`

    if (status === 'running') {
        const text =
            starts === null ? 'Still running' : `${starts}, still running`

        if (axis === null || offset === null) {
            return (
                <span
                    id={id}
                    data-slot="timing-bar"
                    data-state="none"
                    title={text}
                    className={cn('text-muted-foreground', className)}
                >
                    In progress
                    {offset === null ? null : (
                        <span className="sr-only">
                            , starts at {formatOffset(offset)}
                        </span>
                    )}
                </span>
            )
        }

        return (
            <span
                id={id}
                data-slot="timing-bar"
                data-state="open"
                role="img"
                aria-label={text}
                title={text}
                className={cn('flex items-center gap-2', className)}
            >
                <span className="relative block h-2 flex-1 overflow-hidden">
                    <span
                        data-slot="timing-bar-fill"
                        aria-hidden="true"
                        className={bar({ status })}
                        style={
                            clamp01(offset / axis) >= nearEnd
                                ? { right: 0 }
                                : {
                                      left: percent(clamp01(offset / axis)),
                                      right: 0,
                                  }
                        }
                    />
                </span>
                <span className="text-caption whitespace-nowrap text-muted-foreground">
                    In progress
                </span>
            </span>
        )
    }

    if (duration === null) {
        return (
            <span
                id={id}
                data-slot="timing-bar"
                data-state="none"
                title="Timing not captured"
                className={cn('text-muted-foreground', className)}
            >
                Not captured
                {offset === null ? null : (
                    <span className="sr-only">
                        , starts at {formatOffset(offset)}
                    </span>
                )}
            </span>
        )
    }

    const outcome = `${outcomes[status]} ${formatDuration(duration)}`
    const text = starts === null ? capitalise(outcome) : `${starts}, ${outcome}`

    if (axis === null || offset === null) {
        // The span's own duration is known; there is just nothing to draw it on.
        return (
            <span
                id={id}
                data-slot="timing-bar"
                data-state="none"
                title={text}
                className={cn('tabular-nums', className)}
            >
                <span aria-hidden="true">{formatDuration(duration)}</span>
                <span className="sr-only">{text}</span>
            </span>
        )
    }

    const left = clamp01(offset / axis)
    // Only the part of the span inside the axis is drawn; the words still give its real start.
    const inside = offset < 0 ? Math.max(duration + offset, 0) : duration
    // A span that starts at or past the end of the axis is held to its edge, not drawn outside it.
    const placement =
        left >= 1
            ? { right: 0, width: '0%' }
            : {
                  left: percent(left),
                  width: percent(Math.min(inside / axis, 1 - left)),
              }

    return (
        <span
            id={id}
            data-slot="timing-bar"
            data-state="bar"
            role="img"
            aria-label={text}
            title={text}
            className={cn(
                'relative block h-2 w-full overflow-hidden',
                className,
            )}
        >
            <span
                data-slot="timing-bar-fill"
                aria-hidden="true"
                className={bar({ status })}
                style={placement}
            />
        </span>
    )
}
