import { act, render, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { useTimeRange } from '@/hooks/use-time-range'
import { useUrlState } from '@/hooks/use-url-state'
import { intParam, stringParam } from '@/lib/url-state'

// Module-level, as a page would declare it.
const params = { q: stringParam(), page: intParam(1, { min: 1 }) }

/** Runs `useHook` in a browser router at `url`; `result.current` is its latest return value. */
function renderHookAt<T>(useHook: () => T, url: string) {
    const result = { current: undefined as T }

    function Probe() {
        result.current = useHook()

        return null
    }

    window.history.replaceState({}, '', url)
    render(
        <BrowserRouter>
            <Probe />
        </BrowserRouter>,
    )

    return { result }
}

const search = () => window.location.search

describe('useUrlState', () => {
    it('reads the URL', () => {
        const { result } = renderHookAt(
            () => useUrlState(params),
            '/?q=a&page=2',
        )

        expect(result.current[0]).toEqual({ q: 'a', page: 2 })
    })

    it('keeps the same state object while the URL does not change', () => {
        const { result } = renderHookAt(() => useUrlState(params), '/?q=a')
        const first = result.current[0]

        act(() => result.current[1]({ q: 'a' }))

        expect(result.current[0]).toBe(first)
    })

    it('ignores an invalid value without rewriting the URL', () => {
        const { result } = renderHookAt(
            () => useUrlState(params),
            '/?page=0&x=1',
        )

        expect(result.current[0].page).toBe(1)
        expect(search()).toBe('?page=0&x=1')
    })

    it('pushes a history entry by default, so Back restores the state', async () => {
        const { result } = renderHookAt(() => useUrlState(params), '/?x=1')

        act(() => result.current[1]({ page: 3 }))

        expect(search()).toBe('?x=1&page=3')
        expect(result.current[0].page).toBe(3)

        act(() => window.history.back())
        await waitFor(() => expect(search()).toBe('?x=1'))

        expect(result.current[0].page).toBe(1)
    })

    it('replaces the entry when asked', () => {
        const { result } = renderHookAt(() => useUrlState(params), '/?x=1')
        const length = window.history.length

        act(() => result.current[1]({ q: 'ab' }, { replace: true }))

        expect(search()).toBe('?x=1&q=ab')
        expect(window.history.length).toBe(length)
    })

    it('leaves a default out of the URL', () => {
        const { result } = renderHookAt(() => useUrlState(params), '/?page=3')

        act(() => result.current[1]({ page: 1 }))

        expect(search()).toBe('')
    })

    it('adds no history entry for a write that changes nothing', () => {
        const { result } = renderHookAt(
            () => useUrlState(params),
            '/?page=2&q=a',
        )
        const length = window.history.length

        act(() => result.current[1]({ page: 2 }))
        act(() => result.current[1]({ q: 'a', page: 2 }))

        expect(window.history.length).toBe(length)
        expect(search()).toBe('?page=2&q=a')
    })

    it('keeps the identity of setState across a URL change', () => {
        const { result } = renderHookAt(() => useUrlState(params), '/')
        const first = result.current[1]

        act(() => result.current[1]({ page: 2 }))

        expect(search()).toBe('?page=2')
        expect(result.current[1]).toBe(first)
    })

    it('applies two writes in one tick from different hooks', () => {
        const { result } = renderHookAt(
            () => [useTimeRange(), useUrlState(params)] as const,
            '/?x=1',
        )

        act(() => {
            result.current[0][1]('7d')
            result.current[1][1]({ page: 2 })
        })

        expect(search()).toBe('?x=1&range=7d&page=2')
        expect(result.current[0][0]).toBe('7d')
        expect(result.current[1][0].page).toBe(2)
    })
})

describe('useTimeRange', () => {
    it('is 24h without a range in the URL', () => {
        const { result } = renderHookAt(() => useTimeRange(), '/')

        expect(result.current[0]).toBe('24h')
    })

    it('reads a preset from the URL and falls back for anything else', () => {
        expect(
            renderHookAt(() => useTimeRange(), '/?range=7d').result.current[0],
        ).toBe('7d')
        expect(
            renderHookAt(() => useTimeRange(), '/?range=30d').result.current[0],
        ).toBe('24h')
    })

    it('writes the range, and nothing for the default', () => {
        const { result } = renderHookAt(() => useTimeRange(), '/')

        act(() => result.current[1]('1h'))

        expect(search()).toBe('?range=1h')

        act(() => result.current[1]('24h'))

        expect(search()).toBe('')
    })
})
