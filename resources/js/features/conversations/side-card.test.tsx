import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SideCard } from '@/features/conversations/side-card'

describe('SideCard', () => {
    it('is a named region with a level two heading, open at first', () => {
        render(
            <SideCard label="Session summary">
                <p>Recorded turns</p>
            </SideCard>,
        )

        expect(
            screen.getByRole('region', { name: 'Session summary' }),
        ).toBeVisible()
        expect(
            screen.getByRole('heading', { level: 2, name: 'Session summary' }),
        ).toBeVisible()
        expect(screen.getByText('Recorded turns')).toBeVisible()
    })

    it('folds away from the button beside its title and opens again', async () => {
        const user = userEvent.setup()

        render(
            <SideCard as="nav" label="Jump to turn">
                <a href="#turn-1">Turn 1</a>
            </SideCard>,
        )

        const fold = screen.getByRole('button', {
            name: 'Collapse Jump to turn',
        })

        expect(fold).toHaveAttribute('aria-expanded', 'true')

        await user.click(fold)

        expect(fold).toHaveAttribute('aria-expanded', 'false')
        expect(fold).toHaveAccessibleName('Expand Jump to turn')
        expect(screen.queryByRole('link', { name: 'Turn 1' })).toBeNull()

        await user.click(fold)

        expect(screen.getByRole('link', { name: 'Turn 1' })).toBeVisible()
    })
})
