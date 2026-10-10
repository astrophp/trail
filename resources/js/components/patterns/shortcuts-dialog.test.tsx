import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { until } from '@/test/wait'
import {
    ShortcutsDialog,
    type ShortcutGroup,
} from '@/components/patterns/shortcuts-dialog'

const groups: ShortcutGroup[] = [
    {
        id: 'here',
        heading: 'Lists',
        applies: true,
        rows: [
            { id: 'next', label: 'Next row', keys: ['j'] },
            { id: 'palette', label: 'Open the palette', keys: ['Ctrl K'] },
        ],
    },
    {
        id: 'there',
        heading: 'Run page',
        rows: [{ id: 'back', label: 'Go back', keys: ['g', 'b'] }],
    },
]

function renderDialog(
    props: Partial<React.ComponentProps<typeof ShortcutsDialog>> = {},
) {
    const onOpenChange = vi.fn()

    render(
        <ShortcutsDialog
            open
            onOpenChange={onOpenChange}
            title="Keyboard shortcuts"
            description="What the keys do."
            groups={groups}
            {...props}
        />,
    )

    return { onOpenChange }
}

const dialog = () => screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
const row = (id: string) =>
    dialog().querySelector<HTMLElement>(
        `[data-shortcut="${id}"]`,
    ) as HTMLElement
const caps = (element: HTMLElement) =>
    [...element.querySelectorAll('kbd[data-slot=kbd]')].map(
        (key) => key.textContent,
    )

describe('ShortcutsDialog', () => {
    it('is a dialog with a name and a description', () => {
        renderDialog()

        expect(dialog()).toHaveAccessibleDescription('What the keys do.')
    })

    it('is not drawn while it is closed', () => {
        renderDialog({ open: false })

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('lists the groups in the order given, each under its heading, one row per shortcut', () => {
        renderDialog()

        expect(
            within(dialog())
                .getAllByRole('heading', { level: 3 })
                .map((heading) => heading.firstChild?.textContent),
        ).toEqual(['Lists', 'Run page'])
        expect(
            [...dialog().querySelectorAll('[data-shortcut]')].map((item) =>
                item.getAttribute('data-shortcut'),
            ),
        ).toEqual(['next', 'palette', 'back'])
        expect(row('next')).toHaveTextContent('Next row')
    })

    it('marks the groups that apply and no other', () => {
        renderDialog({ appliesLabel: 'Applies here' })

        expect(within(dialog()).getAllByText('Applies here')).toHaveLength(1)
        expect(
            within(
                within(dialog()).getByRole('group', { name: /^Lists/ }),
            ).getByText('Applies here'),
        ).toBeInTheDocument()
        expect(
            within(
                within(dialog()).getByRole('group', { name: /^Run page/ }),
            ).queryByText('Applies here'),
        ).not.toBeInTheDocument()
    })

    it('draws each key as a key cap, and the presses of a sequence joined by a word', () => {
        renderDialog({ thenLabel: 'then' })

        expect(caps(row('next'))).toEqual(['j'])
        expect(caps(row('palette'))).toEqual(['Ctrl K'])
        expect(caps(row('back'))).toEqual(['g', 'b'])
        expect(row('back')).toHaveTextContent('then')
        expect(row('next')).not.toHaveTextContent('then')
    })

    it('closes with its Close button and with Escape', async () => {
        const user = userEvent.setup()
        const { onOpenChange } = renderDialog()

        await user.click(
            within(dialog()).getByRole('button', { name: 'Close' }),
        )
        await user.keyboard('{Escape}')

        expect(onOpenChange.mock.calls).toEqual([[false], [false]])
    })

    it('is marked as the shortcut help, so the key that opens it can close it', () => {
        renderDialog()

        expect(dialog()).toHaveAttribute('data-shortcut-help')
    })

    it('hands focus to the caller when it closes', async () => {
        const onCloseAutoFocus = vi.fn()
        const view = render(
            <ShortcutsDialog
                open
                onOpenChange={() => {}}
                title="Keyboard shortcuts"
                description="What the keys do."
                groups={groups}
                onCloseAutoFocus={onCloseAutoFocus}
            />,
        )

        view.rerender(
            <ShortcutsDialog
                open={false}
                onOpenChange={() => {}}
                title="Keyboard shortcuts"
                description="What the keys do."
                groups={groups}
                onCloseAutoFocus={onCloseAutoFocus}
            />,
        )

        // Radix gives it back a moment after the dialog has gone.
        await until(() => expect(onCloseAutoFocus).toHaveBeenCalledTimes(1))
    })
})
