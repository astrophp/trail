import { fireEvent, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useShortcuts } from '@/hooks/use-shortcuts'

function Page({
    handlers,
    children,
}: {
    handlers: Record<string, (() => void) | undefined>
    children?: React.ReactNode
}) {
    useShortcuts(handlers)

    return <div>{children}</div>
}

describe('useShortcuts', () => {
    it('calls the handler of the key pressed', async () => {
        const j = vi.fn()
        const k = vi.fn()

        render(<Page handlers={{ j, k }} />)
        await userEvent.keyboard('j')

        expect(j).toHaveBeenCalledTimes(1)
        expect(k).not.toHaveBeenCalled()
    })

    it('uses the latest handlers, and a key without a handler does nothing', async () => {
        const first = vi.fn()
        const second = vi.fn()
        const view = render(<Page handlers={{ j: first }} />)

        view.rerender(<Page handlers={{ j: second }} />)
        await userEvent.keyboard('j')
        view.rerender(<Page handlers={{ j: undefined }} />)
        await userEvent.keyboard('j')

        expect(first).not.toHaveBeenCalled()
        expect(second).toHaveBeenCalledTimes(1)
    })

    it('stops listening when the page goes away', async () => {
        const j = vi.fn()
        const view = render(<Page handlers={{ j }} />)

        view.unmount()
        await userEvent.keyboard('j')

        expect(j).not.toHaveBeenCalled()
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

        const view = render(<Page handlers={{ j }}>{field}</Page>)

        const target = view.container.querySelector<HTMLElement>(
            'input, textarea, select, [role], [contenteditable]',
        )
        // The key goes to the field, as it does when the field has focus.
        fireEvent.keyDown(target as HTMLElement, { key: 'j' })

        expect(j).not.toHaveBeenCalled()
    })

    it.each([
        ['ctrl', '{Control>}j{/Control}'],
        ['alt', '{Alt>}j{/Alt}'],
        ['meta', '{Meta>}j{/Meta}'],
    ])('does not fire with %s held', async (_name, keys) => {
        const j = vi.fn()

        render(<Page handlers={{ j }} />)
        await userEvent.keyboard(keys)

        expect(j).not.toHaveBeenCalled()
    })

    it('does not fire for a capital letter, or a held key', async () => {
        const j = vi.fn()

        render(<Page handlers={{ j }} />)
        await userEvent.keyboard('J')
        await userEvent.keyboard('{j>3/}{/j}')

        // The held key counts once: its repeats are ignored.
        expect(j).toHaveBeenCalledTimes(1)
    })

    it.each(['dialog', 'menu', 'listbox'])(
        'does not fire while a %s is open',
        async (role) => {
            const j = vi.fn()

            render(
                <Page handlers={{ j }}>
                    <div role={role}>open</div>
                </Page>,
            )
            await userEvent.keyboard('j')

            expect(j).not.toHaveBeenCalled()
        },
    )

    it('does not call a handler for a key the browser already handled', async () => {
        const j = vi.fn()

        render(<Page handlers={{ j }} />)
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
    })
})
