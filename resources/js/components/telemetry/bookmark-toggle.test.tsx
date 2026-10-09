import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BookmarkToggle } from '@/components/telemetry/bookmark-toggle'

const run = {
    id: '019a3f2c-7b1e-7d4a-9c55-0e8f2a6b4d31',
    name: 'SupportAssistant',
}

const name = 'Bookmark SupportAssistant 019a3f2c…4d31'

describe('BookmarkToggle', () => {
    it('is named after the run and its short id, and says it is not pressed', () => {
        render(
            <BookmarkToggle
                trace={{ ...run, bookmarked: false }}
                onPressedChange={() => {}}
            />,
        )

        const button = screen.getByRole('button', { name })

        expect(button).toHaveAttribute('aria-pressed', 'false')
        // An outline: the shape cue is the fill, not only the colour.
        expect(button.querySelector('svg')).toHaveAttribute('fill', 'none')
    })

    it('keeps the same name when bookmarked: aria-pressed alone carries the state', () => {
        render(
            <BookmarkToggle
                trace={{ ...run, bookmarked: true }}
                onPressedChange={() => {}}
            />,
        )

        const button = screen.getByRole('button', { name })

        expect(button).toHaveAttribute('aria-pressed', 'true')
        expect(button.querySelector('svg')).toHaveAttribute(
            'fill',
            'currentColor',
        )
    })

    it('reports the state a press asks for', async () => {
        const onPressedChange = vi.fn()

        render(
            <BookmarkToggle
                trace={{ ...run, bookmarked: false }}
                onPressedChange={onPressedChange}
            />,
        )
        await userEvent.click(screen.getByRole('button'))

        expect(onPressedChange).toHaveBeenCalledWith(true)
    })

    it('ignores presses but stays focusable while disabled, and says so', async () => {
        const onPressedChange = vi.fn()

        render(
            <BookmarkToggle
                trace={{ ...run, bookmarked: false }}
                onPressedChange={onPressedChange}
                disabled
            />,
        )

        const button = screen.getByRole('button', { name })

        await userEvent.click(button)
        await userEvent.keyboard('{Enter}')

        expect(onPressedChange).not.toHaveBeenCalled()
        expect(button).toHaveAttribute('aria-disabled', 'true')
        expect(button).toHaveFocus()
    })
})
