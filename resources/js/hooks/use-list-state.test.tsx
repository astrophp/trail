import { act, render } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { useListState } from '@/hooks/use-list-state'
import { boolParam, enumParam, intParam, stringParam } from '@/lib/url-state'

// Module-level, as a page would declare them.
const params = {
    page: intParam(1, { min: 1 }),
    sort: enumParam(['name', '-name'] as const, 'name'),
    q: stringParam(),
    mine: boolParam(),
    other: stringParam('all'),
}
const filterKeys = ['q', 'mine', 'other'] as const

function renderList(url: string) {
    const result = { current: undefined as unknown as ReturnType<typeof use> }

    function use() {
        return useListState(params, filterKeys)
    }

    function Probe() {
        result.current = use()

        return null
    }

    window.history.replaceState({}, '', url)
    render(
        <BrowserRouter>
            <Probe />
        </BrowserRouter>,
    )

    return result
}

const search = () => window.location.search
const entries = () => window.history.length

describe('useListState', () => {
    it('reads the URL', () => {
        const list = renderList('/?page=3&q=a&sort=-name')

        expect(list.current.state).toEqual({
            page: 3,
            sort: '-name',
            q: 'a',
            mine: false,
            other: 'all',
        })
    })

    it('returns to page 1 when a filter or the sort changes, in one history entry', () => {
        const list = renderList('/?page=3')
        const before = entries()

        act(() => list.current.change({ q: 'refund' }))

        expect(search()).toBe('?q=refund')
        expect(entries()).toBe(before + 1)

        act(() => list.current.setPage(4))
        act(() => list.current.change({ sort: '-name' }))

        expect(search()).toBe('?sort=-name&q=refund')
        expect(entries()).toBe(before + 3)
    })

    it('passes replace on to the write', () => {
        const list = renderList('/?page=2')
        const before = entries()

        act(() => list.current.change({ q: 'r' }, { replace: true }))

        expect(search()).toBe('?q=r')
        expect(entries()).toBe(before)
    })

    it('replaces the entry, instead of pushing, when setPage is given replace', () => {
        const list = renderList('/?q=a')
        const before = entries()

        act(() => list.current.setPage(3, { replace: true }))

        expect(search()).toBe('?page=3&q=a')
        expect(entries()).toBe(before)

        act(() => list.current.setPage(4))

        expect(search()).toBe('?page=4&q=a')
        expect(entries()).toBe(before + 1)
    })

    it('keeps the identity of its functions when the URL changes, so an effect that depends on one does not rerun', () => {
        const list = renderList('/?q=a')
        const first = list.current

        act(() => list.current.change({ q: 'b' }))
        act(() => list.current.setPage(2))

        expect(list.current.state.q).toBe('b')
        expect(list.current.setPage).toBe(first.setPage)
        expect(list.current.change).toBe(first.change)
        expect(list.current.clear).toBe(first.clear)
        expect(list.current.clearAll).toBe(first.clearAll)
    })

    it('moves to the page it is given, and keeps the filters', () => {
        const list = renderList('/?q=a')

        act(() => list.current.setPage(2))

        expect(search()).toBe('?page=2&q=a')
    })

    it('puts the given filters back to their default and returns to page 1, in one entry', () => {
        const list = renderList('/?page=3&q=a&mine=1&other=x&sort=-name')
        const before = entries()

        act(() => list.current.clear(['q', 'other']))

        // `other` goes back to its own default, not to an empty string.
        expect(search()).toBe('?sort=-name&mine=1')
        expect(entries()).toBe(before + 1)
    })

    it('clears every filter at once but leaves the sort', () => {
        const list = renderList('/?page=3&q=a&mine=1&other=x&sort=-name')
        const before = entries()

        act(() => list.current.clearAll())

        expect(search()).toBe('?sort=-name')
        expect(entries()).toBe(before + 1)
    })
})
