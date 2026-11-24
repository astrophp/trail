import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InfoHint } from '@/components/patterns/info-hint'

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('InfoHint', () => {
    it('is a named button that shows its detail on keyboard focus', async () => {
        // The tooltip measures itself; jsdom has nothing to measure with.
        vi.stubGlobal(
            'ResizeObserver',
            class {
                observe() {}
                unobserve() {}
                disconnect() {}
            },
        )
        const user = userEvent.setup()

        render(
            <InfoHint label="About model prices">
                A saved price applies to runs recorded from now on.
            </InfoHint>,
        )

        const button = screen.getByRole('button', {
            name: 'About model prices',
        })

        expect(screen.queryByRole('tooltip')).toBeNull()

        await user.tab()
        expect(button).toHaveFocus()
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'A saved price applies to runs recorded from now on.',
        )
    })
})
