import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp, appReady } from '@/test/render-app'
import {
    expectSearch,
    lastTraceUrl,
    loaded,
    mockApi,
    noChips,
    paramsOf,
    searchBox,
    traceUrls,
} from '@/test/traces-api'

beforeEach(() => {
    mockApi()
    vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
    vi.useRealTimers()
})

const typing = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
const pause = (ms = 300) => act(() => vi.advanceTimersByTimeAsync(ms))
const entries = () => window.history.length
const goBack = () => {
    act(() => window.history.back())
}

describe('writing to the URL', () => {
    it('waits for a pause in typing: keystrokes make one request and one history entry', async () => {
        const user = typing()
        const fetchMock = mockApi()
        renderApp('/traces?page=2')
        await loaded()

        const requests = traceUrls(fetchMock).length
        const before = entries()

        await user.type(searchBox(), 'refund')

        expect(searchBox()).toHaveValue('refund')
        expect(window.location.search).toBe('?page=2')
        expect(traceUrls(fetchMock)).toHaveLength(requests)

        await pause()
        await expectSearch('?search=refund')
        await waitFor(() =>
            expect(traceUrls(fetchMock)).toHaveLength(requests + 1),
        )
        expect(paramsOf(lastTraceUrl(fetchMock))).toMatchObject({
            search: 'refund',
            page: '1',
        })
        expect(entries()).toBe(before + 1)
        expect(searchBox()).toHaveFocus()
    })

    it('writes at once on Enter', async () => {
        const user = typing()
        renderApp('/traces')
        await loaded()

        await user.type(searchBox(), 'refund{Enter}')

        // No pause was waited for.
        await expectSearch('?search=refund')
    })

    it('writes at once when the box loses focus', async () => {
        const user = typing()
        renderApp('/traces')
        await loaded()

        await user.type(searchBox(), 'refund')
        await user.click(screen.getByRole('tab', { name: /^Failed/ }))

        // Without advancing the clock to the end of the pause.
        expect(window.location.search).toBe('?status=failed&search=refund')
    })

    it('does not let the box hold more than the API reads', async () => {
        renderApp('/traces')
        await appReady()

        expect(searchBox()).toHaveAttribute('maxlength', '200')
    })

    it('keeps spaces typed at the end in the box', async () => {
        const user = typing()
        renderApp('/traces')
        await loaded()

        await user.type(searchBox(), 'two words ')
        await pause()

        await expectSearch('?search=two+words')
        expect(searchBox()).toHaveValue('two words ')
    })
})

describe('the history of a typing session', () => {
    it('replaces the entry for the writes that follow the first, and Back returns to before the search', async () => {
        const user = typing()
        renderApp('/traces?page=2')
        await loaded()

        const before = entries()

        await user.type(searchBox(), 'refund')
        await pause()
        await expectSearch('?search=refund')

        await user.type(searchBox(), ' now')
        await pause()
        await expectSearch('?search=refund+now')
        expect(entries()).toBe(before + 1)

        goBack()
        await expectSearch('?page=2')
        await waitFor(() => expect(searchBox()).toHaveValue(''))

        act(() => window.history.forward())
        await expectSearch('?search=refund+now')
        await waitFor(() => expect(searchBox()).toHaveValue('refund now'))
    })

    it('starts a new entry once focus has left the box', async () => {
        const user = typing()
        renderApp('/traces')
        await loaded()

        await user.type(searchBox(), 'refund')
        await pause()
        await expectSearch('?search=refund')
        const before = entries()

        await user.click(screen.getByRole('tab', { name: /^Failed/ }))
        await expectSearch('?status=failed&search=refund')
        await user.click(searchBox())
        await user.type(searchBox(), 's')
        await pause()
        await expectSearch('?status=failed&search=refunds')
        expect(entries()).toBe(before + 2)
    })

    it.each([
        [
            'Backspace',
            async (user: ReturnType<typeof typing>) => {
                await user.keyboard('{Backspace}')
            },
        ],
        [
            'the clear button',
            async (user: ReturnType<typeof typing>) => {
                await user.click(
                    screen.getByRole('button', { name: 'Clear search' }),
                )
            },
        ],
    ])(
        'goes back one entry instead of repeating the starting view when %s empties the box',
        async (_how, empty) => {
            const user = typing()
            renderApp('/traces')
            await loaded()

            const before = entries()

            await user.type(searchBox(), 'a')
            await pause()
            await expectSearch('?search=a')
            expect(entries()).toBe(before + 1)

            await empty(user)
            await pause(10)

            // Back on the view the session started from, which is the entry before the search…
            await expectSearch('')
            await waitFor(() => expect(searchBox()).toHaveValue(''))
            noChips()
            // …so one more Back leaves the page: no entry repeats the one before it.
            goBack()
            await waitFor(() => expect(window.location.pathname).toBe('/'))
        },
    )

    it('empties a search that began with a value by replacing, not by going back', async () => {
        const user = typing()
        renderApp('/traces?search=first')
        await loaded()

        const before = entries()

        await user.type(searchBox(), ' more')
        await pause()
        await expectSearch('?search=first+more')
        await user.clear(searchBox())
        await pause(10)

        await expectSearch('')
        expect(entries()).toBe(before + 1)
        // Back returns to the entry that had `first`.
        goBack()
        await expectSearch('?search=first')
    })

    it('goes back when retyping returns to the starting search', async () => {
        const user = typing()
        renderApp('/traces?search=first')
        await loaded()

        await user.type(searchBox(), 'x')
        await pause()
        await expectSearch('?search=firstx')

        await user.keyboard('{Backspace}')
        await pause()

        await expectSearch('?search=first')
        goBack()
        await waitFor(() => expect(window.location.pathname).toBe('/'))
    })
})

describe('a change of location the box did not make', () => {
    it('updates the box when Back or Forward changes the search', async () => {
        const user = typing()
        renderApp('/traces?search=first')
        await loaded()

        await user.clear(searchBox())
        await user.type(searchBox(), 'second')
        await user.tab()
        await expectSearch('?search=second')

        goBack()
        await expectSearch('?search=first')
        await waitFor(() => expect(searchBox()).toHaveValue('first'))
    })

    it('drops a write that was waiting when Back lands on an entry with the same search', async () => {
        const user = typing()
        renderApp('/traces?search=first')
        await loaded()

        // A second entry with the same search: another sort.
        await user.click(screen.getByRole('button', { name: /Duration/ }))
        await expectSearch('?sort=-duration&search=first')
        const before = entries()

        await user.click(searchBox())
        await user.type(searchBox(), ' more')
        expect(searchBox()).toHaveValue('first more')

        // Still typing (focus never left the box): Back to the entry whose search is the same.
        goBack()
        await expectSearch('?search=first')
        await pause(1000)

        expect(window.location.search).toBe('?search=first')
        expect(searchBox()).toHaveValue('first')
        expect(entries()).toBe(before)
    })

    it('lets a chip removed right after typing win over the typed text', async () => {
        const user = typing()
        renderApp('/traces?search=first')
        await loaded()

        await user.type(searchBox(), ' more')
        // The click moves focus, which writes the typed text first; the removal follows it.
        await user.click(
            screen.getByRole('button', {
                name: 'Remove filter: Search: first',
            }),
        )

        await expectSearch('')
        await pause(1000)
        expect(window.location.search).toBe('')
        expect(searchBox()).toHaveValue('')
    })

    it('keeps a keystroke typed before the box’s own write has been rendered', async () => {
        renderApp('/traces?search=first')
        await loaded()

        const box = searchBox()

        // Within one render batch: the emptied box is written, then another key is typed.
        await act(async () => {
            fireEvent.change(box, { target: { value: '' } })
            await vi.advanceTimersByTimeAsync(1)
            fireEvent.change(box, { target: { value: 's' } })
        })

        expect(searchBox()).toHaveValue('s')
        await pause()
        await expectSearch('?search=s')
        expect(searchBox()).toHaveValue('s')
    })
})

describe('an IME composition', () => {
    it('is not written while it is open, and is written when it ends', async () => {
        renderApp('/traces')
        await loaded()

        fireEvent.compositionStart(searchBox())
        fireEvent.change(searchBox(), { target: { value: 'ご' } })
        await pause(1000)

        expect(window.location.search).toBe('')

        fireEvent.change(searchBox(), { target: { value: 'ご返金' } })
        fireEvent.compositionEnd(searchBox())
        await pause()

        await expectSearch(`?search=${encodeURIComponent('ご返金')}`)
    })

    it('is written when the box loses focus before it ends', async () => {
        const user = typing()
        renderApp('/traces')
        await loaded()

        await user.click(searchBox())
        fireEvent.compositionStart(searchBox())
        fireEvent.change(searchBox(), { target: { value: 'ご返金' } })
        await pause(1000)
        expect(window.location.search).toBe('')

        await user.click(screen.getByRole('tab', { name: /^Failed/ }))

        expect(window.location.search).toBe(
            `?status=failed&search=${encodeURIComponent('ご返金')}`,
        )
    })

    it('is written after the pause when focus moves on to the clear button', async () => {
        const user = typing()
        renderApp('/traces')
        await loaded()

        await user.click(searchBox())
        fireEvent.compositionStart(searchBox())
        fireEvent.change(searchBox(), { target: { value: 'ご返金' } })
        await user.tab()
        await pause()

        await expectSearch(`?search=${encodeURIComponent('ご返金')}`)
    })
})
