import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ViewSwitch } from '@/components/patterns/view-switch'

const views = [
    { value: 'tree', label: 'Tree' },
    { value: 'raw', label: 'Raw', title: 'The value as stored' },
] as const

describe('ViewSwitch', () => {
    it('is a named group with the chosen view on', () => {
        render(
            <ViewSwitch
                label="arguments view"
                options={views}
                value="tree"
                onValueChange={() => {}}
            />,
        )

        expect(
            screen.getByRole('radiogroup', { name: 'arguments view' }),
        ).toBeVisible()
        expect(screen.getByRole('radio', { name: 'Tree' })).toBeChecked()
        expect(screen.getByRole('radio', { name: 'Raw' })).toHaveAttribute(
            'title',
            'The value as stored',
        )
    })

    it('reports a new choice, and nothing when the one that is on is pressed', async () => {
        const user = userEvent.setup()
        const change = vi.fn()

        render(
            <ViewSwitch
                label="arguments view"
                options={views}
                value="tree"
                onValueChange={change}
            />,
        )

        await user.click(screen.getByRole('radio', { name: 'Tree' }))
        expect(change).not.toHaveBeenCalled()

        await user.click(screen.getByRole('radio', { name: 'Raw' }))
        expect(change).toHaveBeenCalledWith('raw')
    })
})
