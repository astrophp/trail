import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SelectFilter } from '@/components/patterns/select-filter'

const options = [
    { value: 'apple', label: 'Apples' },
    { value: 'pear', label: 'Pears' },
]

function Controlled({
    initial = null,
    onValueChange = () => {},
}: {
    initial?: string | null
    onValueChange?: (value: string | null) => void
}) {
    const [value, setValue] = useState<string | null>(initial)

    return (
        <SelectFilter
            aria-label="Fruit"
            allLabel="All fruit"
            options={options}
            className="extra"
            value={value}
            onValueChange={(next) => {
                setValue(next)
                onValueChange(next)
            }}
        />
    )
}

describe('SelectFilter', () => {
    it('shows the all label when nothing is chosen', () => {
        render(<Controlled />)

        expect(
            screen.getByRole('combobox', { name: 'Fruit' }),
        ).toHaveTextContent('All fruit')
    })

    it('shows the label of the chosen option', () => {
        render(<Controlled initial="pear" />)

        expect(
            screen.getByRole('combobox', { name: 'Fruit' }),
        ).toHaveTextContent('Pears')
    })

    it('lists the all item and the options', async () => {
        render(<Controlled />)

        await userEvent.click(screen.getByRole('combobox'))

        expect(
            screen.getAllByRole('option').map((option) => option.textContent),
        ).toEqual(['All fruit', 'Apples', 'Pears'])
    })

    it('emits the value of an option, and null for all', async () => {
        const onValueChange = vi.fn()
        render(<Controlled onValueChange={onValueChange} />)

        await userEvent.click(screen.getByRole('combobox'))
        await userEvent.click(screen.getByRole('option', { name: 'Apples' }))
        expect(onValueChange).toHaveBeenLastCalledWith('apple')

        await userEvent.click(screen.getByRole('combobox'))
        await userEvent.click(screen.getByRole('option', { name: 'All fruit' }))
        expect(onValueChange).toHaveBeenLastCalledWith(null)
    })

    it('returns focus to the trigger after choosing', async () => {
        render(<Controlled />)

        const trigger = screen.getByRole('combobox')

        await userEvent.click(trigger)
        await userEvent.click(screen.getByRole('option', { name: 'Pears' }))

        expect(screen.getByRole('combobox')).toBe(trigger)
        expect(trigger).toHaveFocus()
    })

    it('chooses with the keyboard', async () => {
        const onValueChange = vi.fn()
        render(<Controlled onValueChange={onValueChange} />)

        screen.getByRole('combobox').focus()
        await userEvent.keyboard('{Enter}{ArrowDown}{Enter}')

        expect(onValueChange).toHaveBeenLastCalledWith('apple')
    })

    it('shows a value that is not among the options, and lists it last', async () => {
        render(
            <SelectFilter
                aria-label="Fruit"
                allLabel="All fruit"
                options={options}
                value="quince"
                onValueChange={() => {}}
            />,
        )

        expect(screen.getByRole('combobox')).toHaveTextContent('quince')

        await userEvent.click(screen.getByRole('combobox'))

        expect(
            screen.getAllByRole('option').map((option) => option.textContent),
        ).toEqual(['All fruit', 'Apples', 'Pears', 'quince'])
    })
})
