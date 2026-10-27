import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { TextViewSwitch } from '@/components/patterns/text-view-switch'
import { resetTextView } from '@/hooks/use-text-view'

beforeEach(() => {
    localStorage.clear()
    resetTextView()
})

describe('TextViewSwitch', () => {
    it('starts on Rendered and switches every switch to Raw', async () => {
        const user = userEvent.setup()

        render(
            <>
                <TextViewSwitch label="Turn 1 response" />
                <TextViewSwitch label="Turn 2 response" />
            </>,
        )

        const first = screen.getByRole('radiogroup', {
            name: 'Turn 1 response view',
        })

        expect(
            screen.getAllByRole('radio', { name: 'Rendered' })[0],
        ).toBeChecked()

        await user.click(screen.getAllByRole('radio', { name: 'Raw' })[0])

        for (const raw of screen.getAllByRole('radio', { name: 'Raw' })) {
            expect(raw).toBeChecked()
        }
        expect(first).toBeVisible()
        expect(localStorage.getItem('trail-text-view')).toBe('raw')
    })

    it('stays on when the chosen view is pressed again', async () => {
        const user = userEvent.setup()

        render(<TextViewSwitch label="Response" />)

        await user.click(screen.getByRole('radio', { name: 'Rendered' }))

        expect(screen.getByRole('radio', { name: 'Rendered' })).toBeChecked()
    })

    it('says that the choice applies to every answer', () => {
        render(<TextViewSwitch label="Response" />)

        expect(screen.getByRole('radio', { name: 'Raw' })).toHaveAttribute(
            'title',
            'Raw — applies to every answer',
        )
    })
})
