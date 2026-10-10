import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePaletteShortcut } from '@/features/palette/use-palette-shortcut'

afterEach(() => {
    vi.restoreAllMocks()
    document.body.replaceChildren()
})

function Harness({ toggle }: { toggle: () => void }) {
    usePaletteShortcut(toggle)

    return <input aria-label="A field" />
}

const onPlatform = (platform: string) =>
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

/** Presses a key and returns the event, to see whether it was taken from the browser. */
function press(key: string, init: KeyboardEventInit = {}, target?: Element) {
    const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
    })

    ;(target ?? document.body).dispatchEvent(event)

    return event
}

describe('usePaletteShortcut', () => {
    it('toggles on Command K on an Apple platform and takes the key from the browser', () => {
        onPlatform('MacIntel')
        const toggle = vi.fn()
        render(<Harness toggle={toggle} />)

        const event = press('k', { metaKey: true })

        expect(toggle).toHaveBeenCalledTimes(1)
        expect(event.defaultPrevented).toBe(true)
    })

    it('toggles on Ctrl K elsewhere', () => {
        onPlatform('Win32')
        const toggle = vi.fn()
        render(<Harness toggle={toggle} />)

        press('k', { ctrlKey: true })

        expect(toggle).toHaveBeenCalledTimes(1)
    })

    it('takes the capital letter too (Caps Lock)', () => {
        onPlatform('Win32')
        const toggle = vi.fn()
        render(<Harness toggle={toggle} />)

        press('K', { ctrlKey: true })

        expect(toggle).toHaveBeenCalledTimes(1)
    })

    it('ignores the other platform’s modifier, so Ctrl K on a Mac and Command K elsewhere are left alone', () => {
        const toggle = vi.fn()
        render(<Harness toggle={toggle} />)

        onPlatform('MacIntel')
        const control = press('k', { ctrlKey: true })
        onPlatform('Win32')
        const meta = press('k', { metaKey: true })

        expect(toggle).not.toHaveBeenCalled()
        expect(control.defaultPrevented).toBe(false)
        expect(meta.defaultPrevented).toBe(false)
    })

    it('works while the person is typing in a field', () => {
        onPlatform('Win32')
        const toggle = vi.fn()
        render(<Harness toggle={toggle} />)

        press('k', { ctrlKey: true }, screen.getByRole('textbox'))

        expect(toggle).toHaveBeenCalledTimes(1)
    })

    it.each([
        ['a held key', { repeat: true }],
        ['Shift', { shiftKey: true }],
        ['Alt', { altKey: true }],
        ['an IME composition', { isComposing: true }],
    ])('does nothing with %s', (_name, init) => {
        onPlatform('Win32')
        const toggle = vi.fn()
        render(<Harness toggle={toggle} />)

        press('k', { ctrlKey: true, ...init })

        expect(toggle).not.toHaveBeenCalled()
    })

    it('does nothing for another key', () => {
        onPlatform('Win32')
        const toggle = vi.fn()
        render(<Harness toggle={toggle} />)

        press('j', { ctrlKey: true })

        expect(toggle).not.toHaveBeenCalled()
    })

    it.each(['dialog', 'alertdialog', 'menu', 'listbox'])(
        'does nothing while another %s is open, and works again when it is gone',
        (role) => {
            onPlatform('Win32')
            const toggle = vi.fn()
            render(<Harness toggle={toggle} />)
            const other = document.createElement('div')
            other.setAttribute('role', role)
            document.body.append(other)

            press('k', { ctrlKey: true })

            expect(toggle).not.toHaveBeenCalled()

            other.remove()
            press('k', { ctrlKey: true })

            expect(toggle).toHaveBeenCalledTimes(1)
        },
    )

    it('is not stopped by the listbox inside the palette, so the same key closes it', () => {
        onPlatform('Win32')
        const toggle = vi.fn()
        render(<Harness toggle={toggle} />)
        const own = document.createElement('div')
        own.setAttribute('role', 'dialog')
        own.setAttribute('data-palette', '')
        const list = document.createElement('div')
        list.setAttribute('role', 'listbox')
        own.append(list)
        document.body.append(own)

        press('k', { ctrlKey: true })

        expect(toggle).toHaveBeenCalledTimes(1)
    })

    it('is not stopped by the palette’s own dialog, so the same key closes it', () => {
        onPlatform('Win32')
        const toggle = vi.fn()
        render(<Harness toggle={toggle} />)
        const own = document.createElement('div')
        own.setAttribute('role', 'dialog')
        own.setAttribute('data-palette', '')
        document.body.append(own)

        press('k', { ctrlKey: true })

        expect(toggle).toHaveBeenCalledTimes(1)
    })

    it('uses the latest toggle without listening again, and stops listening when unmounted', () => {
        onPlatform('Win32')
        const first = vi.fn()
        const second = vi.fn()
        const { rerender, unmount } = render(<Harness toggle={first} />)

        rerender(<Harness toggle={second} />)
        press('k', { ctrlKey: true })

        expect(first).not.toHaveBeenCalled()
        expect(second).toHaveBeenCalledTimes(1)

        unmount()
        fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })

        expect(second).toHaveBeenCalledTimes(1)
    })
})
