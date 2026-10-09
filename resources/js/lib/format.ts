// The one place a number or a date from Trail's API becomes text. Every function takes a real value:
// whether a value was captured at all is decided by the components in components/telemetry.
// The locale is fixed so the output is the same on every machine.

const locale = 'en-US'

const usd = (digits: number) =>
    new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })

const cents = usd(2)
const fractions = usd(4)

const decimal = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
})

const share = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
})

const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })

const twoDigits = (value: number) => String(value).padStart(2, '0')

/** `$0.0466` under $1, `$1,234.50` from $1. A real zero is `$0.00`; a sliver is `<$0.0001`, never zero. */
export function formatCost(amount: number): string {
    if (amount === 0) {
        return cents.format(0)
    }

    if (amount > 0 && amount < 0.00005) {
        return '<$0.0001'
    }

    // 0.99999 rounds to 1.0000 at four decimals; from $1 the amount is shown in cents.
    return Math.abs(Number(amount.toFixed(4))) >= 1
        ? cents.format(amount)
        : fractions.format(amount)
}

const tokenUnits = [
    { suffix: 'k', size: 1_000 },
    { suffix: 'M', size: 1_000_000 },
    { suffix: 'B', size: 1_000_000_000 },
] as const

/** `842`, `1.2k`, `48.0k`, `1.2M`. A count that rounds up to the next unit moves to it: never `1000.0k`. */
export function formatTokens(count: number): string {
    if (Math.abs(count) < 1_000) {
        return whole.format(count)
    }

    // Tenths of a unit, from whole tenths so a .5 is never lost to floating point.
    const tenths = (unit: (typeof tokenUnits)[number]) =>
        Math.round(Math.abs(count) / (unit.size / 10))

    let index = 0

    while (
        index < tokenUnits.length - 1 &&
        tenths(tokenUnits[index]) >= 10_000
    ) {
        index++
    }

    const unit = tokenUnits[index]
    const value = (Math.sign(count) * tenths(unit)) / 10

    return `${decimal.format(value)}${unit.suffix}`
}

/**
 * A fraction from 0 to 1 as a percentage with one decimal: `3.6%`. A real zero is `0.0%`; a share
 * that would round to it, or to 100.0%, keeps its side of the edge (`<0.1%`, `>99.9%`).
 */
export function formatRate(rate: number): string {
    if (rate > 0 && rate < 0.0005) {
        return '<0.1%'
    }

    if (rate < 1 && rate >= 0.9995) {
        return '>99.9%'
    }

    return share.format(rate)
}

const perMillion = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 })

/**
 * A price per million tokens as the number it is, in US dollars, up to the six decimals the API
 * keeps: `3`, `0.3`, `0.000001`. Never rounded to fewer, so what is shown is what is stored. A
 * real zero is `0`.
 */
export function formatPerMillion(amount: number): string {
    return perMillion.format(amount)
}

/** A whole count with thousands separators: `9,432`, `1,284`. */
export function formatCount(count: number): string {
    return whole.format(count)
}

/** `<1 ms`, `4.8 ms`, `840 ms`, `9.20s`, `1m 05s`, `1h 02m`. Rounding never crosses a unit into `1000 ms` or `60.00s`. */
export function formatDuration(ms: number): string {
    if (ms < 1) {
        return '<1 ms'
    }

    if (ms < 10) {
        const tenths = Math.round(ms * 10) / 10

        if (tenths < 10) {
            return `${tenths.toFixed(1)} ms`
        }
    }

    if (ms < 1_000) {
        const millis = Math.round(ms)

        if (millis < 1_000) {
            return `${millis} ms`
        }
    }

    if (ms < 60_000) {
        const seconds = Math.round(ms / 10) / 100

        if (seconds < 60) {
            return `${seconds.toFixed(2)}s`
        }
    }

    const totalSeconds = Math.round(ms / 1_000)

    if (totalSeconds < 3_600) {
        return `${Math.floor(totalSeconds / 60)}m ${twoDigits(totalSeconds % 60)}s`
    }

    const totalMinutes = Math.round(ms / 60_000)

    return `${Math.floor(totalMinutes / 60)}h ${twoDigits(totalMinutes % 60)}m`
}

/**
 * `formatDuration`, except that exactly zero is `0 ms`: the start of an axis, or an average that
 * really is zero, is not "under a millisecond".
 */
export function formatDurationFromZero(ms: number): string {
    return ms === 0 ? '0 ms' : formatDuration(ms)
}

/**
 * Where something starts on a run's time axis: `+0 ms`, `+31 ms`, `+1.20s`. Built on the units of
 * `formatDuration`. Before the start is a real minus sign: `−12 ms`.
 * The input must be finite: a caller that may hold NaN or Infinity guards it first.
 */
export function formatOffset(ms: number): string {
    if (ms === 0) {
        return '+0 ms'
    }

    return `${ms < 0 ? '\u2212' : '+'}${formatDuration(Math.abs(ms))}`
}

/** `just now` for anything under a second (or ahead of `now`, clock skew), then `43s ago`, `5m ago`, `3h ago`, `2d ago`. */
export function formatRelativeTime(at: Date, now: Date): string {
    const elapsed = now.getTime() - at.getTime()

    if (elapsed < 1_000) {
        return 'just now'
    }

    const seconds = Math.floor(elapsed / 1_000)

    if (seconds < 60) {
        return `${seconds}s ago`
    }

    if (seconds < 3_600) {
        return `${Math.floor(seconds / 60)}m ago`
    }

    if (seconds < 86_400) {
        return `${Math.floor(seconds / 3_600)}h ago`
    }

    return `${Math.floor(seconds / 86_400)}d ago`
}

const knownZones = new Map<string, string | undefined>()

/**
 * A time zone name Intl accepts, or `undefined` (the browser's own) when there is none or it is not one.
 * The boot object carries whatever the host application is configured with. Each name is checked once.
 */
export function resolveTimeZone(
    timeZone: string | null | undefined,
): string | undefined {
    if (!timeZone) {
        return undefined
    }

    if (!knownZones.has(timeZone)) {
        try {
            new Intl.DateTimeFormat(locale, { timeZone })
            knownZones.set(timeZone, timeZone)
        } catch {
            knownZones.set(timeZone, undefined)
        }
    }

    return knownZones.get(timeZone)
}

type ZoneFormat = 'clock' | 'hourMinute' | 'shortDate' | 'day' | 'dateTime'

const zoneFormats: Record<ZoneFormat, Intl.DateTimeFormatOptions> = {
    clock: {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    },
    hourMinute: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    shortDate: { month: 'short', day: 'numeric' },
    day: { year: 'numeric', month: 'numeric', day: 'numeric' },
    // `shortOffset` reads the same for every zone: `GMT+3`, `GMT-4`, `GMT`.
    dateTime: {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
        timeZoneName: 'shortOffset',
    },
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>()

/** One formatter per zone and kind, made on first use: building one is the expensive part. */
function zoneFormatter(kind: ZoneFormat, timeZone: string | undefined) {
    const key = `${kind}|${timeZone ?? ''}`
    let formatter = zoneFormatters.get(key)

    if (!formatter) {
        formatter = new Intl.DateTimeFormat(locale, {
            ...zoneFormats[kind],
            timeZone,
        })
        zoneFormatters.set(key, formatter)
    }

    return formatter
}

/** The time of day, 24-hour with seconds: `14:03:22`. */
export function formatClockTime(
    at: Date,
    timeZone: string | undefined,
): string {
    return zoneFormatter('clock', timeZone).format(at)
}

/** The time of day, 24-hour without seconds: `14:03`. */
export function formatHoursAndMinutes(
    at: Date,
    timeZone: string | undefined,
): string {
    return zoneFormatter('hourMinute', timeZone).format(at)
}

/** The day without a year: `Oct 7`. */
export function formatShortDate(
    at: Date,
    timeZone: string | undefined,
): string {
    return zoneFormatter('shortDate', timeZone).format(at)
}

/** The day and the time of day on one line, always with the day: `Oct 7 · 14:03:22`. */
export function formatDayAndClock(
    at: Date,
    timeZone: string | undefined,
): string {
    return `${formatShortDate(at, timeZone)} \u00b7 ${formatClockTime(at, timeZone)}`
}

/** Whether two instants fall on the same calendar day in a time zone. */
export function isSameDay(
    a: Date,
    b: Date,
    timeZone: string | undefined,
): boolean {
    const day = zoneFormatter('day', timeZone)

    return day.format(a) === day.format(b)
}

/** The full date and time with the zone's offset: `Oct 7, 2026, 14:03:22 GMT+3`. The only place a zone label is produced. */
export function formatDateTime(at: Date, timeZone: string | undefined): string {
    // A zero offset is written `GMT` by some versions of the runtime's locale data and `GMT+0`
    // by others; it is always shown as `GMT`.
    return zoneFormatter('dateTime', timeZone)
        .format(at)
        .replace(/GMT[+-]0$/, 'GMT')
}

const headLength = 8
const tailLength = 4

/**
 * `019a3f2c…b7e1`: the first 8 characters, an ellipsis and the last 4. An id of `whole` characters
 * or fewer (by default, one too short to gain from it) is left whole. Characters are counted as
 * code points, so one outside the basic plane is never split.
 */
export function shortId(
    id: string,
    whole: number = headLength + tailLength + 1,
): string {
    const characters = Array.from(id)

    if (characters.length <= whole) {
        return id
    }

    return `${characters.slice(0, headLength).join('')}…${characters.slice(-tailLength).join('')}`
}
