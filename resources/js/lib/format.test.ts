import { describe, expect, it } from 'vitest'
import {
    formatClockTime,
    formatCost,
    formatCount,
    formatDateTime,
    formatDuration,
    formatRelativeTime,
    formatShortDate,
    formatTokens,
    isSameDay,
    resolveTimeZone,
    shortId,
} from '@/lib/format'

describe('formatCost', () => {
    it.each([
        [0, '$0.00'],
        [0.0466, '$0.0466'],
        [0.00744, '$0.0074'],
        [0.0001, '$0.0001'],
        [0.00005, '$0.0001'],
        [0.00004, '<$0.0001'],
        [0.0000001, '<$0.0001'],
        [0.99994, '$0.9999'],
        [0.99999, '$1.00'],
        [1, '$1.00'],
        [12.345, '$12.35'],
        [1234.5, '$1,234.50'],
        [1234567.891, '$1,234,567.89'],
    ])('formats %s as %s', (amount, text) => {
        expect(formatCost(amount)).toBe(text)
    })
})

describe('formatTokens', () => {
    it.each([
        [0, '0'],
        [842, '842'],
        [999, '999'],
        [1_000, '1.0k'],
        [1_234, '1.2k'],
        [9_432, '9.4k'],
        [48_000, '48.0k'],
        [999_949, '999.9k'],
        [999_950, '1.0M'],
        [1_000_000, '1.0M'],
        [1_234_567, '1.2M'],
        [999_950_000, '1.0B'],
        [2_500_000_000, '2.5B'],
    ])('formats %s as %s', (count, text) => {
        expect(formatTokens(count)).toBe(text)
    })
})

describe('formatCount', () => {
    it.each([
        [0, '0'],
        [12, '12'],
        [9_432, '9,432'],
        [1_234_567, '1,234,567'],
    ])('formats %s as %s', (count, text) => {
        expect(formatCount(count)).toBe(text)
    })
})

describe('formatDuration', () => {
    it.each([
        [0, '<1 ms'],
        [0.4, '<1 ms'],
        [1, '1.0 ms'],
        [4.8, '4.8 ms'],
        [9.94, '9.9 ms'],
        [9.96, '10 ms'],
        [10, '10 ms'],
        [840, '840 ms'],
        [999.4, '999 ms'],
        [999.6, '1.00s'],
        [1_000, '1.00s'],
        [9_200, '9.20s'],
        [59_994, '59.99s'],
        [59_996, '1m 00s'],
        [59_999.9, '1m 00s'],
        [60_000, '1m 00s'],
        [65_000, '1m 05s'],
        [3_599_400, '59m 59s'],
        [3_599_500, '1h 00m'],
        [3_599_900, '1h 00m'],
        [3_600_000, '1h 00m'],
        [3_720_000, '1h 02m'],
        [90_000_000, '25h 00m'],
    ])('formats %s ms as %s', (ms, text) => {
        expect(formatDuration(ms)).toBe(text)
    })
})

describe('formatRelativeTime', () => {
    const now = new Date('2026-01-10T12:00:00Z')
    const ago = (seconds: number) =>
        formatRelativeTime(new Date(now.getTime() - seconds * 1000), now)

    it.each([
        [0, 'just now'],
        [43, '43s ago'],
        [59, '59s ago'],
        [60, '1m ago'],
        [59 * 60 + 59, '59m ago'],
        [60 * 60, '1h ago'],
        [23 * 3600 + 3599, '23h ago'],
        [24 * 3600, '1d ago'],
        [30 * 86_400, '30d ago'],
    ])('%s seconds ago reads %s', (seconds, text) => {
        expect(ago(seconds)).toBe(text)
    })

    it('reads a time ahead of now (clock skew) as just now', () => {
        expect(ago(-5)).toBe('just now')
        expect(ago(-86_400)).toBe('just now')
    })

    it('rounds down, so a run is never shown as older than it is', () => {
        expect(formatRelativeTime(new Date(now.getTime() - 59_999), now)).toBe(
            '59s ago',
        )
    })
})

describe('time of day and date', () => {
    const at = new Date('2026-10-07T21:03:22Z')

    it('shows the clock time in the given zone', () => {
        expect(formatClockTime(at, 'UTC')).toBe('21:03:22')
        expect(formatClockTime(at, 'Europe/Istanbul')).toBe('00:03:22')
        expect(formatClockTime(at, 'Asia/Tokyo')).toBe('06:03:22')
    })

    it('shows midnight as 00, not 24', () => {
        expect(formatClockTime(new Date('2026-10-07T00:00:00Z'), 'UTC')).toBe(
            '00:00:00',
        )
    })

    it('shows the day in the given zone', () => {
        expect(formatShortDate(at, 'UTC')).toBe('Oct 7')
        expect(formatShortDate(at, 'Europe/Istanbul')).toBe('Oct 8')
    })

    it.each([
        ['UTC', 'Oct 7, 2026, 21:03:22 GMT'],
        ['Europe/Istanbul', 'Oct 8, 2026, 00:03:22 GMT+3'],
        ['America/New_York', 'Oct 7, 2026, 17:03:22 GMT-4'],
        ['Europe/Berlin', 'Oct 7, 2026, 23:03:22 GMT+2'],
        ['Asia/Kolkata', 'Oct 8, 2026, 02:33:22 GMT+5:30'],
    ])(
        'shows the full date and time in %s with an offset label',
        (zone, text) => {
            expect(formatDateTime(at, zone)).toBe(text)
        },
    )

    it('shows the offset on each side of a daylight-saving change', () => {
        const before = new Date('2026-03-07T12:00:00Z')
        const after = new Date('2026-03-09T12:00:00Z')

        expect(formatDateTime(before, 'America/New_York')).toBe(
            'Mar 7, 2026, 07:00:00 GMT-5',
        )
        expect(formatDateTime(after, 'America/New_York')).toBe(
            'Mar 9, 2026, 08:00:00 GMT-4',
        )
        expect(formatDateTime(before, 'Europe/Berlin')).toBe(
            'Mar 7, 2026, 13:00:00 GMT+1',
        )
        expect(
            formatDateTime(new Date('2026-03-30T12:00:00Z'), 'Europe/Berlin'),
        ).toBe('Mar 30, 2026, 14:00:00 GMT+2')
    })

    it('uses the browser zone when there is none', () => {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

        expect(formatClockTime(at, undefined)).toBe(formatClockTime(at, zone))
    })

    it('compares days in the zone, not in UTC', () => {
        const late = new Date('2026-10-07T20:30:00Z')
        const early = new Date('2026-10-07T21:30:00Z')

        expect(isSameDay(late, early, 'UTC')).toBe(true)
        expect(isSameDay(late, early, 'Europe/Istanbul')).toBe(false)
        expect(isSameDay(late, new Date('2025-10-07T20:30:00Z'), 'UTC')).toBe(
            false,
        )
    })
})

describe('resolveTimeZone', () => {
    it('keeps a valid zone', () => {
        expect(resolveTimeZone('Europe/Istanbul')).toBe('Europe/Istanbul')
    })

    it.each([null, undefined, '', 'Not/AZone'])(
        'falls back to the browser zone for %s',
        (value) => {
            expect(resolveTimeZone(value)).toBeUndefined()
        },
    )
})

describe('shortId', () => {
    it('keeps the first 8 and the last 4 characters of an id', () => {
        expect(shortId('019a3f2c-7b1e-7d4a-9c55-0e8f2a6b4d31')).toBe(
            '019a3f2c…4d31',
        )
    })

    it('leaves an id too short to gain from it whole', () => {
        expect(shortId('abc')).toBe('abc')
        expect(shortId('0123456789abc')).toBe('0123456789abc')
        expect(shortId('0123456789abcd')).toBe('01234567…abcd')
    })
})
