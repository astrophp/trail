import { useState } from 'react'
import type { TimeRangePreset } from '@/lib/time-range'

type QueryState = {
    data: unknown
    isError: boolean
    error: unknown
    isFetching: boolean
}

/**
 * What to draw when the overview has nothing to show for the range asked for. A retry makes the
 * query pending again and clears its error, so the failure of this range is remembered here and
 * the error state stays on screen (and keeps focus) while the retry runs. A failure belongs to
 * its range: another range never shows it.
 *
 * - `failed`: there is no data and the query errored, or is retrying after an error.
 * - `retrying`: failed, and the retry is in flight.
 * - `failure`: the error to show.
 * - `loading`: there is no data and no failure.
 */
export function useOverviewStatus(
    { data, isError, error, isFetching }: QueryState,
    range: TimeRangePreset,
) {
    const [remembered, setRemembered] = useState<{
        range: TimeRangePreset
        error: unknown
    } | null>(null)

    if (data !== undefined) {
        // An answer ends the failure: a later load of the same range starts from nothing.
        if (remembered !== null) {
            setRemembered(null)
        }
    } else if (
        isError &&
        (remembered?.range !== range || remembered.error !== error)
    ) {
        setRemembered({ range, error })
    }

    const failed =
        data === undefined &&
        (isError || (isFetching && remembered?.range === range))

    return {
        failed,
        retrying: failed && !isError && isFetching,
        failure: isError ? error : remembered?.error,
        loading: data === undefined && !failed,
    }
}
