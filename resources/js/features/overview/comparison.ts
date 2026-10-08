import { timeRangePeriods, type TimeRangePreset } from '@/lib/time-range'

/** What follows a change: which period it is against. */
export const changeCaption = (range: TimeRangePreset) =>
    `vs previous ${timeRangePeriods[range]}`

/**
 * What a change says when the previous period has runs but not this figure. A previous period with
 * no runs at all has no change drawn: the page says it once.
 */
export const noEarlier = (figure: string) => `No earlier ${figure}`
