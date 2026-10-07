import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Notice } from '@/components/patterns/notice'

describe('Notice', () => {
    it.each([
        ['info', 'status', 'lucide-info'],
        ['warning', 'status', 'lucide-triangle-alert'],
        ['danger', 'alert', 'lucide-circle-alert'],
    ] as const)('a %s notice is a %s with its own icon', (tone, role, icon) => {
        render(<Notice tone={tone} title="Heads up" />)

        const notice = screen.getByRole(role)

        expect(notice).toHaveAttribute('data-tone', tone)
        expect(notice.querySelector('svg')).toHaveClass(icon)
        expect(notice.querySelector('svg')).toHaveAttribute(
            'aria-hidden',
            'true',
        )
    })

    it('uses a different icon for each tone', () => {
        const classes = (['info', 'warning', 'danger'] as const).map((tone) => {
            const { container, unmount } = render(
                <Notice tone={tone} title="x" />,
            )
            const icon = container.querySelector('svg')?.getAttribute('class')

            unmount()

            return icon
        })

        expect(new Set(classes).size).toBe(3)
    })

    it('shows the title, and the text when there is some', () => {
        const { rerender } = render(<Notice tone="info" title="Heads up" />)

        expect(screen.getByText('Heads up')).toBeVisible()
        expect(
            document.querySelector('[data-slot="alert-description"]'),
        ).toBeNull()

        rerender(
            <Notice tone="info" title="Heads up">
                More detail.
            </Notice>,
        )

        expect(screen.getByText('More detail.')).toBeVisible()
    })

    it('shows the action it is given', () => {
        render(
            <Notice
                tone="warning"
                title="Paused"
                action={<button type="button">Resume</button>}
            />,
        )

        expect(screen.getByRole('button', { name: 'Resume' })).toBeVisible()
    })

    it('has no dismiss button unless it can be dismissed', () => {
        render(<Notice tone="info" title="x" />)

        expect(
            screen.queryByRole('button', { name: 'Dismiss' }),
        ).not.toBeInTheDocument()
    })

    it('calls onDismiss from a button named Dismiss', async () => {
        const onDismiss = vi.fn()
        render(<Notice tone="info" title="x" onDismiss={onDismiss} />)

        await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

        expect(onDismiss).toHaveBeenCalledOnce()
    })

    it('takes a class name', () => {
        render(<Notice tone="info" title="x" className="extra" />)

        expect(screen.getByRole('status')).toHaveClass('extra')
    })
})
