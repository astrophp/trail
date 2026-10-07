import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ErrorState } from '@/components/patterns/error-state'

const generic = 'Something unexpected happened.'

describe('ErrorState', () => {
    it('shows the message and status of a failed request', () => {
        render(
            <ErrorState error={{ message: 'Server exploded.', status: 500 }} />,
        )

        expect(screen.getByText('Server exploded.')).toBeVisible()
        expect(screen.getByText('Error 500')).toBeVisible()
    })

    it.each([400, 404, 599])('shows a status of %s', (status) => {
        render(<ErrorState error={{ message: 'No.', status }} />)

        expect(screen.getByText(`Error ${status}`)).toBeVisible()
    })

    it.each([0, NaN, 200, 302, 399, 600, 500.5])(
        'shows no status line for a status of %s',
        (status) => {
            render(<ErrorState error={{ message: 'Odd.', status }} />)

            expect(screen.getByText('Odd.')).toBeVisible()
            expect(screen.queryByText(/^Error /)).not.toBeInTheDocument()
        },
    )

    it('says the server could not be reached when no response came back', () => {
        render(
            <ErrorState
                error={{
                    message: 'The server could not be reached.',
                    status: null,
                }}
            />,
        )

        expect(
            screen.getByText(/The server could not be reached\. Check/),
        ).toBeVisible()
        expect(screen.queryByText(/^Error /)).not.toBeInTheDocument()
    })

    it.each(['', '   '])(
        'keeps the status of a failure whose message is %j, with the generic sentence',
        (message) => {
            render(<ErrorState error={{ message, status: 502 }} />)

            expect(screen.getByText('Error 502')).toBeVisible()
            expect(screen.getByText(generic)).toBeVisible()
        },
    )

    it('shows the message of an object that has no status', () => {
        render(<ErrorState error={new Error('The page broke.')} />)

        expect(screen.getByText('The page broke.')).toBeVisible()
        expect(screen.queryByText(/^Error /)).not.toBeInTheDocument()
    })

    it.each([
        ['a string', 'boom'],
        ['null', null],
        ['undefined', undefined],
        ['an object without a message', { code: 7 }],
        ['an empty message', { message: '' }],
    ])('says something generic for %s', (_name, error) => {
        render(<ErrorState error={error} />)

        expect(screen.getByText(generic)).toBeVisible()
        expect(screen.queryByText(/boom|object Object/)).not.toBeInTheDocument()
    })

    it('has a default title and takes another, as a heading', () => {
        const { rerender } = render(<ErrorState error={null} />)

        expect(
            screen.getByRole('heading', {
                level: 2,
                name: 'Something went wrong',
            }),
        ).toBeVisible()

        rerender(<ErrorState error={null} title="Could not load" />)

        expect(
            screen.getByRole('heading', { level: 2, name: 'Could not load' }),
        ).toBeVisible()
    })

    it('says what the caller says instead of the failure, and labels the button', async () => {
        const onRetry = vi.fn()
        render(
            <ErrorState
                error={{ message: 'Unauthenticated.', status: 401 }}
                description="Reload to sign in again."
                retryLabel="Reload"
                onRetry={onRetry}
            />,
        )

        expect(screen.getByText('Reload to sign in again.')).toBeVisible()
        expect(screen.queryByText('Unauthenticated.')).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Reload' }))

        expect(onRetry).toHaveBeenCalledOnce()
    })

    it('is a level 2 heading by default, and level 1 when it is the whole page', () => {
        const { rerender } = render(<ErrorState />)

        expect(screen.getByRole('heading', { level: 2 })).toBeVisible()

        rerender(<ErrorState headingLevel={1} />)

        const title = screen.getByRole('heading', { level: 1 })

        expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
        title.focus()
        expect(title).toHaveFocus()
    })

    it('offers no retry without a callback', () => {
        render(<ErrorState error={null} />)

        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('calls the callback with no arguments, every time', async () => {
        const onRetry = vi.fn()
        render(<ErrorState error={null} onRetry={onRetry} />)

        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

        expect(onRetry).toHaveBeenCalledTimes(2)
        expect(onRetry).toHaveBeenNthCalledWith(1)
        expect(onRetry).toHaveBeenNthCalledWith(2)
    })

    describe('while retrying', () => {
        it('says so, is aria-disabled, stays focusable and does nothing', async () => {
            const onRetry = vi.fn()
            render(<ErrorState error={null} onRetry={onRetry} retrying />)

            const button = screen.getByRole('button', { name: 'Trying again…' })

            expect(button).toHaveAttribute('aria-disabled', 'true')
            expect(button).not.toBeDisabled()

            button.focus()
            await userEvent.click(button)

            expect(button).toHaveFocus()
            expect(onRetry).not.toHaveBeenCalled()
        })

        it('is a plain button when not retrying', () => {
            render(<ErrorState error={null} onRetry={() => {}} />)

            expect(
                screen.getByRole('button', { name: 'Try again' }),
            ).not.toHaveAttribute('aria-disabled')
        })
    })

    it('is an alert, so it is announced when it appears', () => {
        render(<ErrorState error={null} className="extra" />)

        expect(screen.getByRole('alert')).toHaveClass('extra')
    })
})
