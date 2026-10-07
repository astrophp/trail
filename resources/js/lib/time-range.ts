/** The ranges the dashboard offers, as the API's `range` parameter spells them. */
export const timeRangePresets = ['1h', '24h', '7d'] as const

export type TimeRangePreset = (typeof timeRangePresets)[number]

export const defaultTimeRange: TimeRangePreset = '24h'

/** How each range reads in the interface, in the order the presets are offered. */
export const timeRangeLabels: Record<TimeRangePreset, string> = {
    '1h': 'Last hour',
    '24h': 'Last 24 hours',
    '7d': 'Last 7 days',
}
