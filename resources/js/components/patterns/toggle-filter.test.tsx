import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ToggleFilter } from '@/components/patterns/toggle-filter'

function Controlled({
    onPressedChange = () => {},
    count,
}: {
    onPressedChange?: (pressed: boolean) => void
    count?: number
}) {
    const [pressed, setPressed] = useState(false)

    return (
        <ToggleFilter
            pressed={pressed}
            count={count}
            className="extra"
            onPressedChange={(next) => {
                setPressed(next)
                onPressedChange(next)
            }}
        >
            Errors only
        </ToggleFilter>
    )
}

describe('ToggleFilter', () => {
    it('is a button that says whether it is pressed', async () => {
        render(<Controlled />)

        const toggle = screen.getByRole('button', { name: 'Errors only' })

        expect(toggle).toHaveAttribute('aria-pressed', 'false')
        expect(toggle).toHaveClass('extra')

        await userEvent.click(toggle)

        expect(toggle).toHaveAttribute('aria-pressed', 'true')
    })

    it('reports the new state', async () => {
        const onPressedChange = vi.fn()
        render(<Controlled onPressedChange={onPressedChange} />)

        await userEvent.click(screen.getByRole('button'))
        await userEvent.click(screen.getByRole('button'))

        expect(onPressedChange).toHaveBeenNthCalledWith(1, true)
        expect(onPressedChange).toHaveBeenNthCalledWith(2, false)
    })

    it('keeps focus on the toggle when it changes', async () => {
        render(<Controlled />)

        const toggle = screen.getByRole('button')

        await userEvent.click(toggle)

        expect(screen.getByRole('button')).toBe(toggle)
        expect(toggle).toHaveFocus()
    })

    it('toggles from the keyboard', async () => {
        render(<Controlled />)

        await userEvent.tab()
        await userEvent.keyboard(' ')

        expect(screen.getByRole('button')).toHaveAttribute(
            'aria-pressed',
            'true',
        )
    })

    it('shows a count chip, including zero, and none while unknown', () => {
        const { rerender } = render(
            <ToggleFilter
                pressed={false}
                onPressedChange={() => {}}
                count={1204}
            >
                Slow
            </ToggleFilter>,
        )

        expect(screen.getByRole('button')).toHaveTextContent('Slow1,204')

        rerender(
            <ToggleFilter pressed={false} onPressedChange={() => {}} count={0}>
                Slow
            </ToggleFilter>,
        )
        expect(screen.getByRole('button')).toHaveTextContent('Slow0')

        rerender(
            <ToggleFilter pressed={false} onPressedChange={() => {}}>
                Slow
            </ToggleFilter>,
        )
        expect(screen.getByRole('button')).toHaveTextContent(/^Slow$/)
    })
})
