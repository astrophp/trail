import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PanelError } from '@/components/patterns/panel-error'

describe('PanelError', () => {
    it('is an alert that says what went wrong', () => {
        render(<PanelError message="The request was refused." />)

        const alert = screen.getByRole('alert')

        expect(alert).toHaveTextContent('Something went wrong')
        expect(alert).toHaveTextContent('The request was refused.')
    })

    it('has a retry button only when it can retry, and presses it once per click', async () => {
        const onRetry = vi.fn()
        const { rerender } = render(<PanelError message="Failed." />)

        expect(screen.queryByRole('button')).not.toBeInTheDocument()

        rerender(<PanelError message="Failed." onRetry={onRetry} />)

        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

        expect(onRetry).toHaveBeenCalledTimes(1)
        expect(onRetry).toHaveBeenCalledWith()
    })

    it('takes its own words', () => {
        render(
            <PanelError
                title="Could not load this"
                message="Failed."
                onRetry={() => {}}
                retryLabel="Reload"
            />,
        )

        expect(screen.getByText('Could not load this')).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Reload' }),
        ).toBeInTheDocument()
    })

    it('takes a class name', () => {
        render(<PanelError message="Failed." className="extra" />)

        expect(screen.getByRole('alert')).toHaveClass('extra')
    })
})
