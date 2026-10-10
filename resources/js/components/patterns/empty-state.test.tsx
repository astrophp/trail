import { render, screen } from '@testing-library/react'
import { InboxIcon } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from '@/components/patterns/empty-state'

describe('EmptyState', () => {
    it('shows its title and description', () => {
        render(
            <EmptyState
                icon={InboxIcon}
                title="Nothing here"
                description="Add something to begin."
            />,
        )

        expect(screen.getByText('Nothing here')).toBeVisible()
        expect(screen.getByText('Add something to begin.')).toBeVisible()
    })

    it('makes the title a heading, so the page has one', () => {
        render(<EmptyState icon={InboxIcon} title="Nothing here" />)

        expect(
            screen.getByRole('heading', { level: 2, name: 'Nothing here' }),
        ).toBeVisible()
    })

    it('hides the icon from assistive technology', () => {
        const { container } = render(
            <EmptyState icon={InboxIcon} title="Nothing here" />,
        )

        expect(container.querySelector('svg')).toHaveAttribute(
            'aria-hidden',
            'true',
        )
    })

    it('shows the actions it is given', () => {
        render(
            <EmptyState icon={InboxIcon} title="Nothing here">
                <button>Add one</button>
            </EmptyState>,
        )

        expect(screen.getByRole('button', { name: 'Add one' })).toBeVisible()
    })

    it('renders no description or actions when there are none', () => {
        const { container } = render(
            <EmptyState icon={InboxIcon} title="Nothing here" />,
        )

        expect(
            container.querySelector('[data-slot="empty-description"]'),
        ).toBeNull()
        expect(
            container.querySelector('[data-slot="empty-content"]'),
        ).toBeNull()
    })
})
