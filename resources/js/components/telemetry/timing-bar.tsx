import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'
import type { Span, SpanType, Status } from '@/api/types'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatDuration, formatOffset } from '@/lib/format'
import { cn } from '@/lib/utils'

// Status is never colour alone: a failed bar has a hard end cap, an incomplete one is dashed and
// hollow, one awaiting approval is outlined, and a running one is striped and open at its right end.
// The stripes are drawn without motion too; the slide is only added where motion is welcome.
// A finished bar is coloured by its kind of work, the way a network waterfall colours a request by
// its type, in the chart palette so the kinds are told apart; its status keeps its shape.
const bar = cva('absolute inset-y-0 min-w-1.5', {
    variants: {
        status: {
            completed: 'rounded',
            failed: 'rounded-l-sm border-r-2 border-foreground bg-destructive',
            incomplete:
                'rounded-sm border border-dashed border-warning bg-warning-soft',
            awaiting_approval:
                'rounded-sm border border-primary-ink bg-primary-soft',
            running: 'rounded-l-sm bg-stripes-info motion-safe:animate-stripes',
        },
    },
})

// An agent spans the work under it, so it is a light range; the work itself is solid: model steps
// blue, tools amber, retrieval green, media grey. Red stays failure's alone.
export const timingBarColours: Record<SpanType, string> = {
    agent: 'bg-chart-1/35',
    step: 'bg-chart-2',
    tool: 'bg-chart-4',
    embedding: 'bg-chart-3',
    classification: 'bg-chart-3',
    reranking: 'bg-chart-3',
    image: 'bg-chart-5',
    audio: 'bg-chart-5',
    transcription: 'bg-chart-5',
}

const fill = (status: Status, type: SpanType | undefined) =>
    cn(
        bar({ status }),
        status === 'completed' &&
            (type ? timingBarColours[type] : 'bg-primary'),
    )

/** The timing of a bar on hover, one fact a line, the way a network waterfall breaks a request down. */
function Breakdown({ rows }: { rows: [string, string][] }) {
    return (
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
            {rows.map(([label, value]) => (
                <div key={label} className="contents">
                    <dt className="opacity-70">{label}</dt>
                    <dd className="text-end">{value}</dd>
                </div>
            ))}
        </dl>
    )
}

/** The track of a drawn bar, with its breakdown on hover. */
function Track({
    breakdown,
    children,
}: {
    breakdown: [string, string][]
    children: ReactNode
}) {
    return (
        // Its own provider, so a bar works wherever it is drawn.
        <TooltipProvider>
            <Tooltip>
                {/* A wrapper, so the bar keeps its own attributes. */}
                <TooltipTrigger asChild>
                    <span className="block">{children}</span>
                </TooltipTrigger>
                <TooltipContent side="top">
                    <Breakdown rows={breakdown} />
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

const outcomes: Record<Exclude<Status, 'running'>, string> = {
    completed: 'took',
    failed: 'failed after',
    incomplete: 'incomplete after',
    awaiting_approval: 'awaiting approval after',
}

/** The name of a finished bar's length in its breakdown. */
const durationLabels: Record<Exclude<Status, 'running'>, string> = {
    completed: 'Duration',
    failed: 'Failed after',
    incomplete: 'Incomplete after',
    awaiting_approval: 'Awaiting approval after',
}

const capitalise = (text: string) =>
    text.charAt(0).toUpperCase() + text.slice(1)

type TimingBarProps = {
    span: Pick<Span, 'offset_ms' | 'duration_ms' | 'status'> &
        Partial<Pick<Span, 'type'>>
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
    const { status, type } = span
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

        // The same track as every finished bar, so a start lines up with theirs and with the axis.
        return (
            <Track
                breakdown={[
                    ['Started', formatOffset(offset)],
                    ['Duration', 'Still running'],
                ]}
            >
                <span
                    id={id}
                    data-slot="timing-bar"
                    data-state="open"
                    role="img"
                    aria-label={text}
                    className={cn(
                        'relative block h-3.5 w-full overflow-hidden',
                        className,
                    )}
                >
                    <span
                        data-slot="timing-bar-fill"
                        aria-hidden="true"
                        className={fill(status, type)}
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
            </Track>
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
        <Track
            breakdown={[
                ['Started', formatOffset(offset)],
                [durationLabels[status], formatDuration(duration)],
                ['Ended', formatOffset(offset + duration)],
            ]}
        >
            <span
                id={id}
                data-slot="timing-bar"
                data-state="bar"
                role="img"
                aria-label={text}
                className={cn(
                    'relative block h-3.5 w-full overflow-hidden',
                    className,
                )}
            >
                <span
                    data-slot="timing-bar-fill"
                    aria-hidden="true"
                    className={fill(status, type)}
                    style={placement}
                />
            </span>
        </Track>
    )
}
