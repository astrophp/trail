import { useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { readState, writeState, type Params, type State } from '@/lib/url-state'

export type SetUrlState<P extends Params> = (
    patch: Partial<State<P>>,
    options?: { replace?: boolean },
) => void

/** The query string without regard to the order of its keys. */
function canonical(search: URLSearchParams): string {
    const copy = new URLSearchParams(search)
    copy.sort()

    return copy.toString()
}

/**
 * The URL's query string as typed state. A change adds a history entry, so Back
 * restores the previous state; pass `replace` for changes made while typing. A
 * change that leaves the URL as it is adds nothing.
 *
 * `params` must be a constant at module level: the state is recomputed whenever
 * its identity changes.
 *
 * A write is applied to the URL as it is when `setState` is called, not as it was
 * at the last render, so several writes in one tick (from different hooks) all land.
 */
export function useUrlState<P extends Params>(
    params: P,
): [State<P>, SetUrlState<P>] {
    const [search] = useSearchParams()
    const navigate = useNavigate()
    const state = useMemo(() => readState(params, search), [params, search])
    const setState = useCallback<SetUrlState<P>>(
        (patch, options) => {
            const current = new URLSearchParams(window.location.search)
            const next = writeState(params, current, patch)

            if (canonical(next) !== canonical(current)) {
                void navigate(
                    { search: next.toString() },
                    { replace: options?.replace },
                )
            }
        },
        [params, navigate],
    )

    return [state, setState]
}
