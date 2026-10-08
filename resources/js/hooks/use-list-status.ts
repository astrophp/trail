import { useEffect, useState } from 'react'

/** The part of a page of results this hook reads. */
type ListPage = {
    data: readonly unknown[]
    pagination: { total: number; last_page: number }
}

type ListStatusInput = {
    /** The query's fields: the data (placeholder data included) and what state it is in. */
    data: ListPage | undefined
    isError: boolean
    error: unknown
    isFetching: boolean
    isPlaceholderData: boolean
    /** The page the URL has, and how to move to another without a history entry of its own. */
    page: number
    setPage: (page: number, options: { replace: boolean }) => void
    /** Changes whenever the view (range, filters, sort, page) does. */
    viewKey: string
}

/**
 * What a list page should draw, from its query. Placeholder data answers for the previous URL, so
 * "empty" is never read from it. It does not make every number safe: rows from a placeholder are
 * the previous view's rows, and the caller draws them `busy` (dimmed). A count, total or page
 * number shown outside the dimmed table must also check the query's `isPlaceholderData`.
 *
 * - `failed`: this view has nothing to show and the query errored, or is retrying after an error.
 * - `retrying`: failed, and the retry is in flight.
 * - `failure`: the error to show for a failed view, kept across a retry.
 * - `loading`: no data, a page past the end, or an empty placeholder: draw skeleton rows.
 * - `empty`: this view's own answer is that there is nothing.
 *
 * A page past the end (a stale link, pruned rows) answers with no rows but the real totals: the
 * hook moves to the real last page, replacing the entry, and reports `loading` meanwhile.
 */
export function useListStatus({
    data,
    isError,
    error,
    isFetching,
    isPlaceholderData,
    page,
    setPage,
    viewKey,
}: ListStatusInput) {
    const pastTheEnd =
        data !== undefined &&
        !isPlaceholderData &&
        data.data.length === 0 &&
        data.pagination.total > 0 &&
        page !== data.pagination.last_page
    const lastPage = data?.pagination.last_page

    useEffect(() => {
        if (pastTheEnd && lastPage !== undefined) {
            setPage(lastPage, { replace: true })
        }
    }, [pastTheEnd, lastPage, setPage])

    // A retry makes the query pending again and clears its error. Remember the failure of this
    // view, so the error state stays on screen (and keeps focus) while the retry runs.
    const [remembered, setRemembered] = useState<{
        view: string
        error: unknown
    } | null>(null)

    if (
        isError &&
        (remembered?.view !== viewKey || remembered.error !== error)
    ) {
        setRemembered({ view: viewKey, error })
    }

    // An errored query has no placeholder data, so this is a view that has nothing to show.
    const failed =
        data === undefined &&
        (isError || (isFetching && remembered?.view === viewKey))
    const retrying = failed && !isError && isFetching
    // Placeholder data answers for the previous URL, so an empty one (no rows, or a page past the
    // end) says nothing about this one.
    const loading =
        data === undefined ||
        pastTheEnd ||
        (isPlaceholderData && data.data.length === 0)
    const empty = !failed && !loading && data.pagination.total === 0

    return {
        failed,
        retrying,
        loading,
        empty,
        failure: isError ? error : remembered?.error,
    }
}
