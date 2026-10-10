import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Direction = 'up' | 'down'
type Tone = 'good' | 'bad' | 'neutral'
type Polarity = 'up-is-good' | 'up-is-bad' | 'neutral'

type ChangeProps = {
    /** The value now. Without one there is nothing to compare and nothing is drawn. */
    current: number | null
    /** The value of the previous period. `null` means there is no earlier data to compare with. */
    previous: number | null
    /** Whether more is better, worse or neither; it only decides the colour. */
    polarity: Polarity
    /** Said only when `previous` is `null`: the earlier period has no data. A previous value of 0 is data. */
    noPreviousLabel?: string
    /** Muted text after the figure, such as "vs previous 24h". */
    caption?: ReactNode
    className?: string
} & (
    | {
          /** Values that are already shares, given as fractions from 0 to 1: shown in percentage points. */
          mode: 'points'
          renderDifference?: undefined
      }
    | {
          /** A percentage of the previous value. */
          mode: 'relative'
          /** Draws the difference itself when the previous value is 0, where a percentage does not exist. */
          renderDifference?: (magnitude: number) => ReactNode
      }
    | {
          /** The difference itself, drawn by `renderDifference`. */
          mode: 'absolute'
          /** Draws the size of the difference (never negative); the sign and direction are added around it. */
          renderDifference: (magnitude: number) => ReactNode
      }
)

const minus = '−'

// Sums of decimals carry noise of about 1e-16 of their size (0.1 + 0.2 is not 0.3); a
// difference that small is the same value, not a change.
const sameWithinRounding = 1e-12

// Beyond this a percentage stops being informative and its digits only get in the way.
const largestShown = 999.9

// Fixed locale: the same text for every viewer, whatever their browser language.
const oneDecimal = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
})

const toneClasses: Record<Tone, string> = {
    good: 'text-success',
    bad: 'text-destructive',
    neutral: 'text-muted-foreground',
}

function toneOf(direction: Direction, polarity: Polarity): Tone {
    if (polarity === 'neutral') {
        return 'neutral'
    }

    return (direction === 'up') === (polarity === 'up-is-good') ? 'good' : 'bad'
}

function isNumber(value: number | null): value is number {
    return value !== null && Number.isFinite(value)
}

/**
 * How a value moved since the previous period: an arrow, a signed figure and the same in words
 * for a screen reader, so direction never rests on colour. Nothing is drawn without a current
 * value, a missing previous value is said, and a previous value of 0 is shown as "from 0" rather than as a percentage.
 */
export function Change({
    current,
    previous,
    mode,
    renderDifference,
    polarity,
    noPreviousLabel = 'No earlier data',
    caption,
    className,
}: ChangeProps) {
    if (!isNumber(current)) {
        return null
    }

    const root = (tone: Tone, children: ReactNode, direction?: Direction) => (
        <span
            data-slot="change"
            data-tone={tone}
            data-direction={direction}
            className={cn(
                'inline-flex flex-wrap items-center gap-x-1.5 text-caption',
                className,
            )}
        >
            {children}
        </span>
    )

    const unknown = root(
        'neutral',
        <span className="text-muted-foreground">{noPreviousLabel}</span>,
    )

    if (!isNumber(previous)) {
        return unknown
    }

    const captionNode = caption ? (
        <span className="text-muted-foreground">{caption}</span>
    ) : null

    const difference = current - previous

    if (
        difference === 0 ||
        Math.abs(difference) <=
            sameWithinRounding * Math.max(Math.abs(current), Math.abs(previous))
    ) {
        return root(
            'neutral',
            <>
                <span className="text-muted-foreground">No change</span>
                {captionNode}
            </>,
        )
    }

    const direction: Direction = difference > 0 ? 'up' : 'down'
    const size = Math.abs(difference)
    const sign = direction === 'up' ? '+' : minus
    const tone = toneOf(direction, polarity)
    const Icon = direction === 'up' ? ArrowUpIcon : ArrowDownIcon

    const drawn = (figure: ReactNode) =>
        root(
            tone,
            <>
                <span
                    className={cn(
                        'inline-flex items-center gap-1',
                        toneClasses[tone],
                    )}
                >
                    <Icon aria-hidden="true" className="size-3 shrink-0" />
                    {figure}
                </span>
                {captionNode}
            </>,
            direction,
        )

    // A figure whose size is drawn by the caller (a cost, a duration, a count).
    const absolute = (render: (magnitude: number) => ReactNode) =>
        drawn(
            <span className="tabular-nums">
                <span className="sr-only">{direction} </span>
                <span aria-hidden="true">{sign}</span>
                {render(size)}
            </span>,
        )

    // A figure made here. Percentage points are read in full where "pp" would be unclear.
    const percentage = (value: number, unit: 'percent' | 'points') => {
        const huge = !Number.isFinite(value) || value > largestShown
        const text = huge ? '0.0' : oneDecimal.format(value)
        const tiny = !huge && text === '0.0'
        const shown = huge ? '999' : tiny ? '0.1' : text
        const short = unit === 'percent' ? `${shown}%` : `${shown} pp`
        const long =
            unit === 'percent' ? `${shown}%` : `${shown} percentage points`

        return drawn(
            <span className="tabular-nums">
                <span aria-hidden="true">
                    {huge
                        ? `>${short}`
                        : tiny
                          ? `<${short}`
                          : `${sign}${short}`}
                </span>
                <span className="sr-only">
                    {huge
                        ? `${direction} by more than ${long}`
                        : tiny
                          ? `${direction} by less than ${long}`
                          : `${direction} ${long}`}
                </span>
            </span>,
        )
    }

    switch (mode) {
        case 'absolute':
            return renderDifference ? absolute(renderDifference) : unknown
        case 'points':
            return percentage(size * 100, 'points')
        case 'relative':
            if (previous === 0) {
                return renderDifference
                    ? absolute(renderDifference)
                    : drawn(
                          <span>
                              <span className="sr-only">{direction} </span>
                              from 0
                          </span>,
                      )
            }

            return percentage((size * 100) / Math.abs(previous), 'percent')
    }
}
