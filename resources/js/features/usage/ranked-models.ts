import type { To } from 'react-router'
import type { UsageSort } from '@/api/usage'
import { usageListParams } from '@/api/usage-list-view'
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

/**
 * The sentence under the heading that says which figure ranks, so no ranking is left to be
 * guessed. When the breakdown read only part of the models (`truncated`), it says the ranking is
 * among those read and never claims a complete one.
 */
export function rankingNote(metric: ActivityMode, truncated: boolean): string {
    const among = truncated ? ' among the models read; some were not' : ''

    if (metric === 'duration') {
        return truncated
            ? 'Ranked by runs among the models read (some were not), because duration is not recorded per model.'
            : 'Models are ranked by runs because duration is not recorded per model.'
    }

    return `Ranked by ${metric === 'cost' ? 'estimated cost' : 'runs'}${among}.`
}

/**
 * The Usage page's breakdown by model for a range, ranked as the list is: written with the page's
 * own parameters, so a value the page would use anyway (its default range and sort) is left out.
 */
export function usageModelsLink(range: TimeRangePreset, sort: UsageSort): To {
    const search = writeState(
        { range: timeRangeParam, sort: usageListParams.sort },
        new URLSearchParams({ by: 'model' }),
        { range, sort },
    ).toString()

    return { pathname: '/usage', search: `?${search}` }
}
