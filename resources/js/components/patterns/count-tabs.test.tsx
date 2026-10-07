import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CountTabs, type CountTab } from '@/components/patterns/count-tabs'

const tabs: CountTab[] = [
    { value: 'all', label: 'All', count: 1284 },
    { value: 'failed', label: 'Failed', count: 0 },
    { value: 'running', label: 'Running' },
]

function Controlled({
    onValueChange = () => {},
}: {
    onValueChange?: (v: string) => void
}) {
    const [value, setValue] = useState('all')

    return (
        <CountTabs
            aria-label="Status"
            tabs={tabs}
            value={value}
            className="extra"
            onValueChange={(next) => {
                setValue(next)
                onValueChange(next)
            }}
        >
            <p>The list</p>
        </CountTabs>
    )
}

describe('CountTabs', () => {
    it('renders a tab per entry, in a labelled tab list', () => {
        render(<Controlled />)

        expect(
            screen.getByRole('tablist', { name: 'Status' }),
        ).toBeInTheDocument()
        expect(
            screen.getAllByRole('tab').map((tab) => tab.textContent),
        ).toEqual(['All 1,284', 'Failed 0', 'Running'])
        expect(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute(
            'aria-selected',
            'true',
        )
    })

    it('shows no chip for an unknown count and 0 for zero', () => {
        render(<Controlled />)

        const running = screen.getByRole('tab', { name: 'Running' })

        expect(running.querySelector('[data-slot="count-chip"]')).toBeNull()
        expect(screen.getByRole('tab', { name: /Failed/ })).toHaveTextContent(
            '0',
        )
    })

    it('reads each tab as its label and count, with a space between', () => {
        render(<Controlled />)

        expect(
            screen.getByRole('tab', { name: 'Failed 0' }),
        ).toBeInTheDocument()
        expect(
            screen.getByRole('tab', { name: 'All 1,284' }),
        ).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Running' })).toBeInTheDocument()
    })

    it('reports the tab that was clicked', async () => {
        const onValueChange = vi.fn()
        render(<Controlled onValueChange={onValueChange} />)

        await userEvent.click(screen.getByRole('tab', { name: 'Running' }))

        expect(onValueChange).toHaveBeenCalledWith('running')
        expect(screen.getByRole('tab', { name: 'Running' })).toHaveFocus()
    })

    it('moves focus with the arrow keys without choosing, and chooses with Enter or Space', async () => {
        const onValueChange = vi.fn()
        render(<Controlled onValueChange={onValueChange} />)

        await userEvent.tab()
        expect(screen.getByRole('tab', { name: /^All/ })).toHaveFocus()

        await userEvent.keyboard('{ArrowRight}')
        expect(screen.getByRole('tab', { name: /Failed/ })).toHaveFocus()
        expect(onValueChange).not.toHaveBeenCalled()
        expect(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute(
            'aria-selected',
            'true',
        )

        await userEvent.keyboard('{Enter}')
        expect(onValueChange).toHaveBeenLastCalledWith('failed')

        await userEvent.keyboard('{ArrowRight}')
        await userEvent.keyboard(' ')
        expect(onValueChange).toHaveBeenLastCalledWith('running')

        await userEvent.keyboard('{ArrowRight}')
        expect(screen.getByRole('tab', { name: /^All/ })).toHaveFocus()
    })

    it('controls a panel that holds the children', () => {
        render(<Controlled />)

        const tab = screen.getByRole('tab', { name: /^All/ })
        const panel = screen.getByRole('tabpanel')

        expect(tab).toHaveAttribute('aria-controls', panel.id)
        expect(panel).toHaveAttribute('aria-labelledby', tab.id)
        expect(panel).toHaveTextContent('The list')
        expect(panel.closest('[data-slot=count-tabs]')).toHaveClass('extra')
        // The content has controls of its own: the panel is not an extra, ringless Tab stop.
        expect(panel).toHaveAttribute('tabindex', '-1')
    })
})
