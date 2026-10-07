import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TimeRangeSelect } from '@/components/patterns/time-range-select'

describe('TimeRangeSelect', () => {
    it('shows the current range', () => {
        render(
            <TimeRangeSelect
                value="24h"
                onValueChange={() => {}}
                className="extra"
            />,
        )

        expect(
            screen.getByRole('combobox', { name: 'Time range' }),
        ).toHaveTextContent('Last 24 hours')
        expect(screen.getByRole('combobox')).toHaveClass('extra')
    })

    it('offers the three ranges', async () => {
        render(<TimeRangeSelect value="24h" onValueChange={() => {}} />)

        await userEvent.click(screen.getByRole('combobox'))

        expect(
            screen.getAllByRole('option').map((option) => option.textContent),
        ).toEqual(['Last hour', 'Last 24 hours', 'Last 7 days'])
        expect(
            screen.getByRole('option', { name: 'Last 24 hours' }),
        ).toHaveAttribute('aria-selected', 'true')
    })

    it('reports the range that was chosen, and returns focus to the trigger', async () => {
        const onValueChange = vi.fn()
        render(<TimeRangeSelect value="24h" onValueChange={onValueChange} />)

        const trigger = screen.getByRole('combobox')

        await userEvent.click(trigger)
        await userEvent.click(
            screen.getByRole('option', { name: 'Last 7 days' }),
        )

        expect(onValueChange).toHaveBeenCalledWith('7d')
        expect(trigger).toHaveFocus()
    })
})
