import type { Summary } from '@/api/types'
import { timeRangePeriods, type TimeRangePreset } from '@/lib/time-range'

/** What follows a change: which period it is against. */
export const changeCaption = (range: TimeRangePreset) =>
    `vs previous ${timeRangePeriods[range]}`

/**
 * What a change says when it has nothing to compare with. The previous period holding no runs is
 * the default "No earlier data"; a previous period that has runs but not this figure says which
 * figure is missing.
 */
export const missingEarlier = (
    previous: Summary | null,
    figure: string,
): string | undefined =>
    previous === null ? undefined : `No earlier ${figure}`
