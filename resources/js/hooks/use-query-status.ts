import { useState } from 'react'

type QueryState = {
    data: unknown
    isError: boolean
    error: unknown
    isFetching: boolean
}

/**
 * What to draw when a query has nothing to show for the view asked for. A retry makes the query
 * pending again and clears its error, so the failure of this view is remembered here and the error
 * state stays on screen (and keeps focus) while the retry runs. A failure belongs to its view
 * (`scope`: a range, or an agent in a range): another view never shows it.
 *
 * - `failed`: there is no data and the query errored, or is retrying after an error.
 * - `retrying`: failed, and the retry is in flight.
 * - `failure`: the error to show.
 * - `loading`: there is no data and no failure.
 */
export function useQueryStatus(
    { data, isError, error, isFetching }: QueryState,
    scope: string,
) {
    const [remembered, setRemembered] = useState<{
        scope: string
        error: unknown
    } | null>(null)

    if (data !== undefined) {
        // An answer ends the failure: a later load of the same view starts from nothing.
        if (remembered !== null) {
            setRemembered(null)
        }
    } else if (
        isError &&
        (remembered?.scope !== scope || remembered.error !== error)
    ) {
        setRemembered({ scope, error })
    }

    const failed =
        data === undefined &&
        (isError || (isFetching && remembered?.scope === scope))

    return {
        failed,
        retrying: failed && !isError && isFetching,
        failure: isError ? error : remembered?.error,
        loading: data === undefined && !failed,
    }
}
