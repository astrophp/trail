import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PayloadViewer } from '@/components/patterns/payload-viewer'

/** The view of a structured value that is shown: the tree or the raw text. */
const shownView = (root: ParentNode = document) =>
    root.querySelector<HTMLElement>('[data-view]:not([hidden])')!

vi.mock('@/components/patterns/notify', () => ({
    notify: { success: vi.fn(), error: vi.fn() },
}))

const stored = '{"order_number":"NW-10482","items":["Backpack"]}'

describe('PayloadViewer framed under a title', () => {
    it('puts the title, the view switch and copy in one header bar above the value', () => {
        render(
            <PayloadViewer
                value={{ order_number: 'NW-10482' }}
                label="lookup_order arguments"
                title={<span>lookup_order</span>}
            />,
        )

        const group = screen.getByRole('group', {
            name: 'lookup_order arguments',
        })
        const header = within(group)
            .getByText('lookup_order')
            .closest('div')!.parentElement!

        expect(
            within(header).getByRole('radio', { name: 'Tree' }),
        ).toBeVisible()
        expect(
            within(header).getByRole('button', {
                name: 'Copy lookup_order arguments',
            }),
        ).toBeVisible()
        expect(group).toHaveTextContent('order_number')
    })

    it('shows a result stored as JSON text as a tree, with the text as stored in Raw', async () => {
        const user = userEvent.setup()

        render(
            <PayloadViewer
                value={stored}
                label="lookup_order result"
                title="lookup_order"
                format="json"
            />,
        )

        expect(screen.getByRole('radio', { name: 'Tree' })).toBeChecked()
        expect(shownView()).toHaveTextContent(/items.*Backpack/)

        await user.click(screen.getByRole('radio', { name: 'Raw' }))

        expect(
            shownView().querySelector('[data-slot="capped-text"]'),
        ).toHaveTextContent(stored)
    })

    it.each([
        ['text that is not JSON', 'Order NW-10482 shipped.'],
        ['JSON cut short', '{"order_number":"NW-10'],
        ['a JSON string, not an object', '"just text"'],
    ])('leaves %s as text', (_, value) => {
        render(
            <PayloadViewer
                value={value}
                label="result"
                title="lookup_order"
                format="json"
            />,
        )

        expect(screen.queryByRole('tab')).toBeNull()
        expect(screen.getByText(value)).toBeVisible()
    })
})
