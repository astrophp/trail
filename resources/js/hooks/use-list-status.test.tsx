import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useListStatus } from '@/hooks/use-list-status'

const rows = (n: number, total = n, last = 1) => ({
    data: Array.from({ length: n }, (_, i) => i),
    pagination: { total, last_page: last },
})

const base = {
    data: undefined as ReturnType<typeof rows> | undefined,
    isError: false,
    error: null as unknown,
    isFetching: false,
    isPlaceholderData: false,
    page: 1,
    viewKey: 'a',
}

function status(
    props: Partial<typeof base> & {
        setPage?: (p: number, o: { replace: boolean }) => void
    },
) {
    const setPage = props.setPage ?? vi.fn()

    return renderHook((p) => useListStatus({ ...base, setPage, ...p }), {
        initialProps: props,
    })
}

describe('useListStatus', () => {
    it('is loading until the view has an answer', () => {
        const { result } = status({ isFetching: true })

        expect(result.current).toMatchObject({
            loading: true,
            empty: false,
            failed: false,
        })
    })

    it('is empty only when the view’s own answer has nothing', () => {
        const { result } = status({ data: rows(0) })

        expect(result.current).toMatchObject({ loading: false, empty: true })
    })

    it('has rows, and is neither loading nor empty', () => {
        const { result } = status({ data: rows(3) })

        expect(result.current).toMatchObject({ loading: false, empty: false })
    })

    it('never reads empty from the previous view’s placeholder data', () => {
        const { result } = status({
            data: rows(0),
            isPlaceholderData: true,
            isFetching: true,
        })

        expect(result.current).toMatchObject({ loading: true, empty: false })
    })

    it('is not loading for a placeholder with rows, so a count outside the dimmed table must check isPlaceholderData itself', () => {
        const { result } = status({
            data: rows(3),
            isPlaceholderData: true,
            isFetching: true,
        })

        expect(result.current).toMatchObject({ loading: false, empty: false })
    })

    it('moves a page past the end to the real last page, replacing the entry', () => {
        const setPage = vi.fn()
        const { result } = status({
            data: rows(0, 25, 2),
            page: 5,
            setPage,
        })

        expect(setPage).toHaveBeenCalledExactlyOnceWith(2, { replace: true })
        // Not an empty list, whatever it says: this is a page that does not exist.
        expect(result.current).toMatchObject({ loading: true, empty: false })
    })

    it('does not move when the page is the last one, or the answer is placeholder data', () => {
        const setPage = vi.fn()

        status({ data: rows(0, 25, 2), page: 2, setPage })
        status({
            data: rows(0, 25, 2),
            page: 5,
            isPlaceholderData: true,
            setPage,
        })

        expect(setPage).not.toHaveBeenCalled()
    })

    it('has failed, with the error, when the query errored', () => {
        const error = new Error('down')
        const { result } = status({ isError: true, error })

        expect(result.current).toMatchObject({
            failed: true,
            retrying: false,
            failure: error,
        })
    })

    it('stays failed, retrying and with the same error, while the retry runs', () => {
        const error = new Error('down')
        const { result, rerender } = status({ isError: true, error })

        rerender({ isError: false, error: null, isFetching: true })

        expect(result.current).toMatchObject({
            failed: true,
            retrying: true,
            failure: error,
        })
    })

    it('forgets a failure that belonged to another view', () => {
        const error = new Error('down')
        const { result, rerender } = status({ isError: true, error })

        rerender({ viewKey: 'b', isFetching: true })

        expect(result.current).toMatchObject({ failed: false, loading: true })
    })
})
