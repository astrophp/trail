import { fireEvent, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    sequenceWindow,
    useShortcuts,
    type ShortcutHandlers,
} from '@/hooks/use-shortcuts'

function Page({
    handlers,
    children,
}: {
    handlers: ShortcutHandlers
    children?: React.ReactNode
}) {
    useShortcuts(handlers)

    return <div>{children}</div>
}

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.replaceChildren()
})

const down = (key: string, init: KeyboardEventInit = {}, target?: Element) => {
    const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
    })

    ;(target ?? document.body).dispatchEvent(event)

    return event
}

describe('useShortcuts', () => {
    it('calls the handler of the key pressed', async () => {
        const next = vi.fn()
        const previous = vi.fn()

        render(
            <Page handlers={{ 'row-next': next, 'row-previous': previous }} />,
        )
        await userEvent.keyboard('j')

        expect(next).toHaveBeenCalledTimes(1)
        expect(previous).not.toHaveBeenCalled()
    })

    it('takes the key from the browser when it acts, and leaves it alone when it does not', () => {
        render(<Page handlers={{ 'row-next': vi.fn() }} />)

        expect(down('j').defaultPrevented).toBe(true)
        expect(down('x').defaultPrevented).toBe(false)
    })

    it('uses the latest handlers, and a shortcut without a handler does nothing', async () => {
        const first = vi.fn()
        const second = vi.fn()
        const view = render(<Page handlers={{ 'row-next': first }} />)

        view.rerender(<Page handlers={{ 'row-next': second }} />)
        await userEvent.keyboard('j')
        view.rerender(<Page handlers={{ 'row-next': undefined }} />)
        await userEvent.keyboard('j')

        expect(first).not.toHaveBeenCalled()
        expect(second).toHaveBeenCalledTimes(1)
    })

    it('stops listening when the page goes away', async () => {
        const j = vi.fn()
        const view = render(<Page handlers={{ 'row-next': j }} />)

        view.unmount()
        await userEvent.keyboard('j')

        expect(j).not.toHaveBeenCalled()
    })

    it('has one listener for every component that binds, and removes it with the last', () => {
        const add = vi.spyOn(document, 'addEventListener')
        const remove = vi.spyOn(document, 'removeEventListener')
        const keydown = (spy: typeof add) =>
            spy.mock.calls.filter(([type]) => type === 'keydown')
        const one = render(<Page handlers={{ 'row-next': vi.fn() }} />)
        const two = render(<Page handlers={{ 'row-previous': vi.fn() }} />)

        expect(keydown(add)).toHaveLength(1)

        one.unmount()

        expect(keydown(remove)).toHaveLength(0)

        two.unmount()

        expect(keydown(remove)).toHaveLength(1)
    })

    it('gives a shortcut bound twice to the component mounted first', async () => {
        const first = vi.fn()
        const second = vi.fn()

        render(
            <>
                <Page handlers={{ 'row-next': first }} />
                <Page handlers={{ 'row-next': second }} />
            </>,
        )
        await userEvent.keyboard('j')

        expect(first).toHaveBeenCalledTimes(1)
        expect(second).not.toHaveBeenCalled()
    })

    it('binds only what the table has: another key, or a key the browser acts on, is a type error', () => {
        render(
            <Page
                handlers={{
                    // @ts-expect-error `j` is a key, not the id of a shortcut
                    j: vi.fn(),
                }}
            />,
        )
        render(
            <Page
                handlers={{
                    // @ts-expect-error Enter on a link is the browser's: it cannot be bound
                    'row-open': vi.fn(),
                }}
            />,
        )
    })

    it('fires a key that needs Shift to be typed', async () => {
        const help = vi.fn()

        render(<Page handlers={{ help }} />)
        await userEvent.keyboard('?')

        expect(help).toHaveBeenCalledTimes(1)
    })

    it.each([
        ['an input', <input key="i" aria-label="Name" />],
        ['a textarea', <textarea key="t" aria-label="Name" />],
        [
            'a select',
            <select key="s" aria-label="Name">
                <option>a</option>
            </select>,
        ],
        ['a textbox role', <div key="r" role="textbox" aria-label="Name" />],
        [
            'a combobox role',
            <div
                key="c"
                role="combobox"
                aria-label="Name"
                aria-controls="list"
                aria-expanded="false"
            />,
        ],
        [
            'a searchbox role',
            <div key="b" role="searchbox" aria-label="Name" />,
        ],
        [
            'a plaintext editable element',
            <div
                key="p"
                contentEditable="plaintext-only"
                suppressContentEditableWarning
            >
                text
            </div>,
        ],
        [
            'an editable element',
            <div key="e" contentEditable suppressContentEditableWarning>
                text
            </div>,
        ],
    ])('does not fire while typing in %s', (_name, field) => {
        const j = vi.fn()

        const view = render(<Page handlers={{ 'row-next': j }}>{field}</Page>)

        const target = view.container.querySelector<HTMLElement>(
            'input, textarea, select, [role], [contenteditable]',
        )
        // The key goes to the field, as it does when the field has focus.
        fireEvent.keyDown(target as HTMLElement, { key: 'j' })

        expect(j).not.toHaveBeenCalled()

        // The same key from the page does fire.
        fireEvent.keyDown(view.container, { key: 'j' })

        expect(j).toHaveBeenCalledTimes(1)
    })

    it.each([
        ['ctrl', '{Control>}j{/Control}'],
        ['alt', '{Alt>}j{/Alt}'],
        ['meta', '{Meta>}j{/Meta}'],
    ])('does not fire with %s held', async (_name, keys) => {
        const j = vi.fn()

        render(<Page handlers={{ 'row-next': j }} />)
        await userEvent.keyboard(keys)

        expect(j).not.toHaveBeenCalled()

        await userEvent.keyboard('j')

        expect(j).toHaveBeenCalledTimes(1)
    })

    it('does not fire for a capital letter, or a held key', async () => {
        const j = vi.fn()

        render(<Page handlers={{ 'row-next': j }} />)
        await userEvent.keyboard('J')

        expect(j).not.toHaveBeenCalled()

        await userEvent.keyboard('{j>3/}{/j}')

        // The held key counts once: its repeats are ignored.
        expect(j).toHaveBeenCalledTimes(1)
    })

    it('does not fire during an IME composition', () => {
        const j = vi.fn()

        render(<Page handlers={{ 'row-next': j }} />)
        down('j', { isComposing: true })

        expect(j).not.toHaveBeenCalled()

        down('j')

        expect(j).toHaveBeenCalledTimes(1)
    })

    it.each(['dialog', 'alertdialog', 'menu', 'listbox'])(
        'does not fire while a %s is open, and does again when it is gone',
        (role) => {
            const j = vi.fn()

            render(<Page handlers={{ 'row-next': j }} />)
            const layer = document.createElement('div')
            layer.setAttribute('role', role)
            document.body.append(layer)

            down('j')

            expect(j).not.toHaveBeenCalled()

            layer.remove()
            down('j')

            expect(j).toHaveBeenCalledTimes(1)
        },
    )

    it('does not call a handler for a key the browser already handled', async () => {
        const j = vi.fn()

        render(<Page handlers={{ 'row-next': j }} />)
        document.addEventListener(
            'keydown',
            (event) => event.preventDefault(),
            {
                once: true,
                capture: true,
            },
        )
        await userEvent.keyboard('j')

        expect(j).not.toHaveBeenCalled()

        await userEvent.keyboard('j')

        expect(j).toHaveBeenCalledTimes(1)
    })
})

describe('a modified shortcut', () => {
    const onPlatform = (platform: string) =>
        vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

    it('fires in a field, where a plain one does not', () => {
        onPlatform('Win32')
        const palette = vi.fn()
        const j = vi.fn()
        const view = render(
            <Page handlers={{ palette, 'row-next': j }}>
                <input aria-label="Name" />
            </Page>,
        )
        const field = view.getByRole('textbox')

        down('k', { ctrlKey: true }, field)
        down('j', {}, field)

        expect(palette).toHaveBeenCalledTimes(1)
        expect(j).not.toHaveBeenCalled()
    })

    it('is stopped by another dialog but not by its own, which it can close', () => {
        onPlatform('Win32')
        const palette = vi.fn()
        const help = vi.fn()

        render(<Page handlers={{ palette, help }} />)

        const own = document.createElement('div')
        own.setAttribute('role', 'dialog')
        own.setAttribute('data-palette', '')
        document.body.append(own)

        down('k', { ctrlKey: true })
        down('?', { shiftKey: true })

        // Its own dialog does not stop the palette's key; it stops the help's.
        expect(palette).toHaveBeenCalledTimes(1)
        expect(help).not.toHaveBeenCalled()

        own.remove()

        const ownHelp = document.createElement('div')
        ownHelp.setAttribute('role', 'dialog')
        ownHelp.setAttribute('data-shortcut-help', '')
        document.body.append(ownHelp)

        down('?', { shiftKey: true })
        down('k', { ctrlKey: true })

        expect(help).toHaveBeenCalledTimes(1)
        expect(palette).toHaveBeenCalledTimes(1)
    })
})

describe('a sequence', () => {
    function setup() {
        vi.useFakeTimers()
        const traces = vi.fn()
        const agents = vi.fn()
        const next = vi.fn()

        render(
            <Page
                handlers={{
                    'go-traces': traces,
                    'go-agents': agents,
                    'row-next': next,
                }}
            />,
        )

        return { traces, agents, next }
    }

    it('fires when the second key follows the first in time', () => {
        const { traces, agents } = setup()

        down('g')
        vi.advanceTimersByTime(sequenceWindow - 1)
        const second = down('t')

        expect(traces).toHaveBeenCalledTimes(1)
        expect(agents).not.toHaveBeenCalled()
        expect(second.defaultPrevented).toBe(true)
    })

    it('is forgotten when the second key comes too late, and the late key does nothing', () => {
        const { traces, next } = setup()

        down('g')
        vi.advanceTimersByTime(sequenceWindow)
        down('t')

        expect(traces).not.toHaveBeenCalled()

        // A fresh pair is a sequence again.
        down('g')
        down('t')

        expect(traces).toHaveBeenCalledTimes(1)
        expect(next).not.toHaveBeenCalled()
    })

    it('does nothing on its first key alone', () => {
        const { traces, agents, next } = setup()

        const first = down('g')
        vi.advanceTimersByTime(sequenceWindow * 2)

        expect(traces).not.toHaveBeenCalled()
        expect(agents).not.toHaveBeenCalled()
        expect(next).not.toHaveBeenCalled()
        // Nothing was done, so the key is not taken from the browser.
        expect(first.defaultPrevented).toBe(false)
    })

    it('is abandoned by a key that is not part of one, and that key does nothing itself', () => {
        const { traces, next } = setup()

        down('g')
        const abandoning = down('j')

        expect(next).not.toHaveBeenCalled()
        expect(abandoning.defaultPrevented).toBe(false)

        // Nothing is left pending: the letter that would have completed it is just a letter.
        down('t')

        expect(traces).not.toHaveBeenCalled()

        // And `j` on its own is a shortcut again.
        down('j')

        expect(next).toHaveBeenCalledTimes(1)
    })

    it('is abandoned by the first key pressed twice', () => {
        const { traces } = setup()

        down('g')
        down('g')
        down('t')

        expect(traces).not.toHaveBeenCalled()
    })

    it('goes on through a key that is only a modifier going down', () => {
        const { traces } = setup()

        down('g')
        down('Shift', { shiftKey: true })
        down('Control', { ctrlKey: true })
        down('t')

        expect(traces).toHaveBeenCalledTimes(1)
    })

    it('is not started by a held first key, and a held second key counts once', () => {
        const { traces } = setup()

        down('g', { repeat: true })
        down('t')

        expect(traces).not.toHaveBeenCalled()

        down('g')
        down('t')
        down('t', { repeat: true })

        expect(traces).toHaveBeenCalledTimes(1)
    })

    it('is not started while the person types, and its second key is not taken while they do', () => {
        vi.useFakeTimers()
        const traces = vi.fn()
        const view = render(
            <Page handlers={{ 'go-traces': traces }}>
                <input aria-label="Name" />
            </Page>,
        )
        const field = view.getByRole('textbox')

        down('g', {}, field)
        down('t')

        expect(traces).not.toHaveBeenCalled()

        down('g')
        down('t', {}, field)

        expect(traces).not.toHaveBeenCalled()

        down('g')
        down('t')

        expect(traces).toHaveBeenCalledTimes(1)
    })

    it('is not completed under a dialog', () => {
        const { traces } = setup()

        down('g')

        const layer = document.createElement('div')
        layer.setAttribute('role', 'dialog')
        document.body.append(layer)
        down('t')

        expect(traces).not.toHaveBeenCalled()

        layer.remove()
        down('g')
        down('t')

        expect(traces).toHaveBeenCalledTimes(1)
    })

    it('leaves a modified shortcut pressed in the middle of it to fire', () => {
        vi.useFakeTimers()
        vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Win32')
        const palette = vi.fn()
        const traces = vi.fn()

        render(<Page handlers={{ palette, 'go-traces': traces }} />)
        down('g')
        down('k', { ctrlKey: true })
        down('t')

        expect(palette).toHaveBeenCalledTimes(1)
        expect(traces).not.toHaveBeenCalled()
    })

    it('forgets the first key when the last component that binds it goes away', () => {
        vi.useFakeTimers()
        const traces = vi.fn()
        const view = render(<Page handlers={{ 'go-traces': traces }} />)

        down('g')
        view.unmount()
        render(<Page handlers={{ 'go-traces': traces }} />)
        down('t')

        expect(traces).not.toHaveBeenCalled()
    })

    it('works with real key presses', async () => {
        const traces = vi.fn()

        render(<Page handlers={{ 'go-traces': traces }} />)
        await userEvent.keyboard('gt')

        expect(traces).toHaveBeenCalledTimes(1)
    })

    it('has a window of one and a half seconds', () => {
        expect(sequenceWindow).toBe(1500)
    })
})

describe('a key that does nothing', () => {
    it('is left to the browser, and a key that acts is taken from it', () => {
        render(<Page handlers={{ 'row-next': () => false }} />)

        expect(down('j').defaultPrevented).toBe(false)

        render(<Page handlers={{ 'row-previous': () => {} }} />)

        expect(down('k').defaultPrevented).toBe(true)
    })

    it('is left to the browser in a sequence too', () => {
        render(<Page handlers={{ 'go-traces': () => false }} />)

        down('g')

        expect(down('t').defaultPrevented).toBe(false)
    })

    it('is left to the browser for a modified shortcut', () => {
        vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Win32')
        const palette = vi.fn(() => false as const)

        render(<Page handlers={{ palette }} />)

        expect(down('k', { ctrlKey: true }).defaultPrevented).toBe(false)
        expect(palette).toHaveBeenCalledTimes(1)
    })
})

describe('a focused control that takes no text', () => {
    it.each(['checkbox', 'radio', 'button', 'range'])(
        'is not a field: a %s lets the shortcut fire',
        (type) => {
            const j = vi.fn()
            const view = render(
                <Page handlers={{ 'row-next': j }}>
                    <input type={type} aria-label="Control" />
                </Page>,
            )

            down('j', {}, view.getByLabelText('Control'))

            expect(j).toHaveBeenCalledTimes(1)
        },
    )

    it.each(['text', 'search', 'email', 'number'])(
        'a %s input is a field: nothing fires',
        (type) => {
            const j = vi.fn()
            const view = render(
                <Page handlers={{ 'row-next': j }}>
                    <input type={type} aria-label="Field" />
                </Page>,
            )

            down('j', {}, view.getByLabelText('Field'))

            expect(j).not.toHaveBeenCalled()
        },
    )

    it('still lets Space tick the checkbox', async () => {
        const view = render(
            <Page handlers={{ 'row-next': vi.fn() }}>
                <input type="checkbox" aria-label="Control" />
            </Page>,
        )
        const box = view.getByLabelText('Control')

        box.focus()
        await userEvent.keyboard(' ')

        expect(box).toBeChecked()
    })
})
