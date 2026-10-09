import type { To } from 'react-router'
import type { UsageSort } from '@/api/usage'
import type { ActivityMode } from '@/components/telemetry/activity-mode'
import { timeRangeParam, type TimeRangePreset } from '@/lib/time-range'
import { writeState } from '@/lib/url-state'

/** How many models the list shows: the first rows of the Usage page's breakdown. */
export const rankedModelsShown = 5

/**
 * What the list ranks by, for what the activity chart shows. The breakdown has no duration per
 * model, so under Duration the models are ranked by runs.
 */
export const rankingFor: Record<ActivityMode, UsageSort> = {
    volume: '-runs',
    duration: '-runs',
    cost: '-cost',
}

/** The sentence under the heading that says which figure ranks, so no ranking is left to be guessed. */
export const rankingNote: Record<ActivityMode, string> = {
    volume: 'Ranked by runs.',
    duration:
        'Models are ranked by runs because duration is not recorded per model.',
    cost: 'Ranked by estimated cost.',
}

/** The Usage page's breakdown by model for a range, written with the pages' own range parameter. */
export function usageModelsLink(range: TimeRangePreset): To {
    const search = writeState(
        { range: timeRangeParam },
        new URLSearchParams({ by: 'model' }),
        { range },
    ).toString()

    return { pathname: '/usage', search: `?${search}` }
}
