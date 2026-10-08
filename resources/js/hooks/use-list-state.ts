import { useCallback } from 'react'
import { useUrlState, type SetUrlState } from '@/hooks/use-url-state'
import type { Param, Params, State } from '@/lib/url-state'

type WriteOptions = Parameters<SetUrlState<Params>>[1]

/**
 * A list page's view in the URL: one params object per page, which must contain `page`.
 *
 * Whatever changes which rows the list shows (a filter, the sort) goes through `change`, which
 * returns the list to page 1 in the same history entry: the old page number means nothing in
 * the new result list, and a second entry would make Back land on that meaningless page.
 * Only `setPage` keeps the page it is given.
 *
 * `params` and `filterKeys` must be constants at module level. `filterKeys` are the params that
 * `clearAll` puts back to their `default`.
 */
export function useListState<
    P extends Params & { page: Param<number> },
    K extends Exclude<keyof P, 'page'>,
>(params: P, filterKeys: readonly K[]) {
    const [state, setState] = useUrlState(params)
    /** Changes the view and returns to page 1. Pass `replace` for changes made while typing. */
    const change = useCallback(
        (patch: Partial<Omit<State<P>, 'page'>>, options?: WriteOptions) =>
            setState({ ...patch, page: 1 } as Partial<State<P>>, options),
        [setState],
    )
    const setPage = useCallback(
        (page: number, options?: WriteOptions) =>
            setState({ page } as Partial<State<P>>, options),
        [setState],
    )
    /** Puts the given filters back to "no filter", and the list back on page 1: one history entry. */
    const clear = useCallback(
        (keys: readonly K[]) =>
            change(
                Object.fromEntries(
                    keys.map((key) => [key, params[key].default]),
                ) as Partial<Omit<State<P>, 'page'>>,
            ),
        [change, params],
    )
    const clearAll = useCallback(() => clear(filterKeys), [clear, filterKeys])

    return { state, change, setPage, clear, clearAll }
}
