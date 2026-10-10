import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { BrowserRouter, useNavigate, useSearchParams } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HistorySearchField } from '@/components/patterns/history-search-field'

const onCommit = vi.fn()

/** The field wired the way a list page wires it: the URL's `q` is the value, a commit writes it. */
function Harness({ shortcutHint }: { shortcutHint?: string }) {
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const input = useRef<HTMLInputElement>(null)

    return (
        <>
            <HistorySearchField
                aria-label="Search things"
                placeholder="Search things"
                shortcutHint={shortcutHint}
                value={params.get('q') ?? ''}
                inputRef={input}
                onCommit={(q, options) => {
                    onCommit(q, options)
                    void navigate({ search: q ? `?q=${q}` : '' }, options)
                }}
            />
            <button onClick={() => void navigate('/?q=elsewhere')}>
                Elsewhere
            </button>
            <button>Other control</button>
        </>
    )
}

const box = () => screen.getByRole('searchbox', { name: 'Search things' })
const typing = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
const pause = (ms = 300) => act(() => vi.advanceTimersByTimeAsync(ms))

function renderAt(url = '/', shortcutHint?: string) {
    window.history.replaceState({}, '', url)
    render(
        <BrowserRouter>
            <Harness shortcutHint={shortcutHint} />
        </BrowserRouter>,
    )
}

beforeEach(() => {
    onCommit.mockClear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
    vi.useRealTimers()
})

describe('HistorySearchField', () => {
    it('shows the key that focuses it while it is empty, and tells assistive technology', async () => {
        const user = typing()
        renderAt('/', '/')

        expect(box()).toHaveAttribute('aria-keyshortcuts', '/')
        expect(screen.getByText('/')).toBeInTheDocument()

        await user.type(box(), 'a')

        expect(screen.queryByText('/')).not.toBeInTheDocument()
        expect(box()).toHaveAttribute('aria-keyshortcuts', '/')
    })

    it('says nothing of a key when it is given none', () => {
        renderAt()

        expect(box()).not.toHaveAttribute('aria-keyshortcuts')
    })

    it('holds the box to the length the API reads', () => {
        renderAt()

        expect(box()).toHaveAttribute('maxlength', '200')
    })

    it('commits the normalised text once typing pauses, and not before', async () => {
        const user = typing()
        renderAt()

        await user.type(box(), ' refund ')
        await pause(200)

        expect(onCommit).not.toHaveBeenCalled()
        expect(box()).toHaveValue(' refund ')

        await pause(300)

        expect(onCommit).toHaveBeenCalledExactlyOnceWith('refund', {
            replace: false,
        })
        expect(window.location.search).toBe('?q=refund')
    })

    it('commits at once on Enter', async () => {
        const user = typing()
        renderAt()

        await user.type(box(), 'refund{Enter}')

        expect(onCommit).toHaveBeenCalledExactlyOnceWith('refund', {
            replace: false,
        })
    })

    it('commits at once when the box loses focus', async () => {
        const user = typing()
        renderAt()

        await user.type(box(), 'refund')
        await user.click(screen.getByRole('button', { name: 'Other control' }))

        expect(onCommit).toHaveBeenCalledExactlyOnceWith('refund', {
            replace: false,
        })
    })

    it('pushes for the first write of a session and replaces for the ones after', async () => {
        const user = typing()
        renderAt()
        const before = window.history.length

        await user.type(box(), 'a{Enter}')
        await user.type(box(), 'b{Enter}')
        await user.type(box(), 'c{Enter}')

        expect(onCommit.mock.calls).toEqual([
            ['a', { replace: false }],
            ['ab', { replace: true }],
            ['abc', { replace: true }],
        ])
        expect(window.history.length).toBe(before + 1)
    })

    it('starts a new session, with a push, once focus has left the box', async () => {
        const user = typing()
        renderAt()

        await user.type(box(), 'a{Enter}')
        await user.click(screen.getByRole('button', { name: 'Other control' }))
        await user.type(box(), 'b{Enter}')

        expect(onCommit.mock.calls).toEqual([
            ['a', { replace: false }],
            ['ab', { replace: false }],
        ])
    })

    it('goes Back instead of committing when typing returns to where the session started', async () => {
        const user = typing()
        renderAt('/?q=x')
        const start = window.history.length

        await user.type(box(), 'y{Enter}')
        expect(window.location.search).toBe('?q=xy')
        expect(window.history.length).toBe(start + 1)

        await user.type(box(), '{Backspace}{Enter}')

        // Back, not a second entry that repeats the first.
        await waitFor(() => expect(window.location.search).toBe('?q=x'))
        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(box()).toHaveValue('x')
    })

    it('puts the URL’s search in the box and drops a waiting write when the location changes elsewhere', async () => {
        const user = typing()
        renderAt()

        await user.type(box(), 'typed')
        // A click that does not move focus, like Back or a link followed by the keyboard: the
        // box is not blurred, so nothing commits the typed text before the location changes.
        fireEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))

        await waitFor(() => expect(box()).toHaveValue('elsewhere'))

        // The pause that was running when the location changed has nothing left to write.
        await pause(1000)

        expect(onCommit).not.toHaveBeenCalled()
        expect(window.location.search).toBe('?q=elsewhere')
        expect(box()).toHaveValue('elsewhere')
    })

    it('writes nothing while an IME composition is open, and writes when it ends', async () => {
        renderAt()
        const input = box()

        fireEvent.compositionStart(input)
        fireEvent.change(input, { target: { value: 'にほ' } })
        await pause(1000)

        expect(onCommit).not.toHaveBeenCalled()

        fireEvent.compositionEnd(input)
        await pause(200)

        expect(onCommit).not.toHaveBeenCalled()

        await pause(100)

        expect(onCommit).toHaveBeenCalledExactlyOnceWith('にほ', {
            replace: false,
        })
    })

    it('keeps the session when focus moves to the field’s own clear button', async () => {
        const user = typing()
        renderAt('/?q=x')

        await user.type(box(), 'y{Enter}')
        await user.click(screen.getByRole('button', { name: 'Clear search' }))
        await pause(50)

        // Still the same session: the second write replaces the first.
        expect(onCommit.mock.calls).toEqual([
            ['xy', { replace: false }],
            ['', { replace: true }],
        ])
    })

    it('ends a composition on blur and writes what is in the box at once', async () => {
        renderAt()
        const input = box()

        fireEvent.compositionStart(input)
        fireEvent.change(input, { target: { value: 'にほ' } })
        fireEvent.blur(input)

        expect(onCommit).toHaveBeenCalledExactlyOnceWith('にほ', {
            replace: false,
        })

        // The composition is over, so typing on is written after the pause again.
        fireEvent.change(input, { target: { value: 'にほん' } })
        await pause(300)

        expect(onCommit).toHaveBeenLastCalledWith('にほん', { replace: false })
        expect(onCommit).toHaveBeenCalledTimes(2)
    })

    it('ends a composition when focus moves to the clear button, and writes after the pause', async () => {
        renderAt()
        const input = box()

        fireEvent.compositionStart(input)
        fireEvent.change(input, { target: { value: 'にほ' } })
        fireEvent.blur(input, {
            relatedTarget: screen.getByRole('button', { name: 'Clear search' }),
        })

        // Same session, so not at once.
        expect(onCommit).not.toHaveBeenCalled()

        // The composition is over: typing on is what gets written after the pause.
        fireEvent.change(input, { target: { value: 'にほん' } })
        await pause(300)

        expect(onCommit).toHaveBeenCalledExactlyOnceWith('にほん', {
            replace: false,
        })
    })

    it('ignores Enter while a composition is open', async () => {
        renderAt()
        const input = box()

        fireEvent.compositionStart(input)
        fireEvent.change(input, { target: { value: 'にほ' } })
        fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
        await pause(1000)

        expect(onCommit).not.toHaveBeenCalled()
    })

    it('commits an emptied box without the pause, but not other text', async () => {
        const user = typing()
        renderAt('/?q=abc')

        await user.click(screen.getByRole('button', { name: 'Clear search' }))
        await pause(50)

        expect(onCommit).toHaveBeenCalledExactlyOnceWith('', {
            replace: false,
        })

        onCommit.mockClear()
        await user.type(box(), 'def')
        await pause(50)

        expect(onCommit).not.toHaveBeenCalled()
    })

    it('ends the session, and shows the URL’s search, when Back or Forward is used', async () => {
        const user = typing()
        renderAt('/?q=x')

        await user.type(box(), 'y{Enter}')
        expect(window.location.search).toBe('?q=xy')

        act(() => window.history.back())
        await waitFor(() => expect(box()).toHaveValue('x'))

        act(() => window.history.forward())
        await waitFor(() => expect(box()).toHaveValue('xy'))

        act(() => window.history.back())
        await waitFor(() => expect(box()).toHaveValue('x'))
        onCommit.mockClear()

        // A new session after the pop: its first write pushes, it does not replace.
        await user.type(box(), 'z{Enter}')

        expect(onCommit).toHaveBeenCalledExactlyOnceWith('xz', {
            replace: false,
        })
    })
})
