import { enumParam } from '@/lib/url-state'

/** What the activity chart shows: runs, the average duration, or the cost. */
export const activityModes = ['volume', 'duration', 'cost'] as const

export type ActivityMode = (typeof activityModes)[number]

export const activityModeLabels: Record<ActivityMode, string> = {
    volume: 'Volume',
    duration: 'Duration',
    cost: 'Cost',
}

/** The choice is view state: it is kept in the address under `chart`, and `volume` is left out. */
export const activityParams = {
    chart: enumParam(activityModes, 'volume'),
}
