import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DecimalField } from '@/components/patterns/decimal-field'

const label =
    'Input rate for anthropic claude-sonnet-4-5, US dollars per million tokens'

/** The field with its text kept by the caller, as every use of it does. */
function Harness({
    initial = '',
    onValueChange = () => {},
    ...props
}: {
    initial?: string
    onValueChange?: (value: string) => void
    error?: string
    caption?: string
    disabled?: boolean
}) {
    const [value, setValue] = useState(initial)

    return (
        <DecimalField
            label={label}
            value={value}
            onValueChange={(next) => {
                setValue(next)
                onValueChange(next)
            }}
            {...props}
        />
    )
}

describe('DecimalField', () => {
    it('is named by its whole label', () => {
        render(<Harness />)

        expect(screen.getByRole('textbox', { name: label })).toBeVisible()
    })

    it('is a text input with a decimal keyboard, not a number input', () => {
        render(<Harness />)

        const input = screen.getByRole('textbox', { name: label })

        expect(input).toHaveAttribute('type', 'text')
        expect(input).toHaveAttribute('inputmode', 'decimal')
    })

    it('shows a blank value as blank and zero as 0', () => {
        const { rerender } = render(
            <DecimalField label={label} value="" onValueChange={() => {}} />,
        )

        expect(screen.getByRole('textbox', { name: label })).toHaveValue('')

        rerender(
            <DecimalField label={label} value="0" onValueChange={() => {}} />,
        )

        expect(screen.getByRole('textbox', { name: label })).toHaveValue('0')
    })

    it('reports what is typed as typed, and leaves blank blank when the text is cleared', async () => {
        const user = userEvent.setup()
        const changes = vi.fn<(value: string) => void>()
        render(<Harness initial="3.5" onValueChange={changes} />)

        const input = screen.getByRole('textbox', { name: label })
        await user.clear(input)
        await user.type(input, '0.100')
        await user.clear(input)

        expect(changes.mock.calls.map(([value]) => value)).toEqual([
            '',
            '0',
            '0.',
            '0.1',
            '0.10',
            '0.100',
            '',
        ])
        expect(input).toHaveValue('')
    })

    it('does not round or reformat a value with more decimals than anything keeps', async () => {
        const user = userEvent.setup()
        render(<Harness />)

        const input = screen.getByRole('textbox', { name: label })
        await user.type(input, '0.1234567')

        expect(input).toHaveValue('0.1234567')
    })

    it('shows an error beside the field, linked to it and announced', () => {
        render(<Harness initial="x" error="Enter a plain number." />)

        const input = screen.getByRole('textbox', { name: label })

        expect(input).toBeInvalid()
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Enter a plain number.',
        )
        expect(input).toHaveAccessibleDescription('Enter a plain number.')
    })

    it('has no error, and is valid, without one', () => {
        render(<Harness initial="3" />)

        expect(screen.getByRole('textbox', { name: label })).toBeValid()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('shows a short caption for people who see it, without changing the name', () => {
        render(<Harness caption="Input" />)

        expect(screen.getByText('Input')).toBeVisible()
        expect(screen.getByRole('textbox', { name: label })).toBeVisible()
    })

    it('can be disabled', () => {
        render(<Harness disabled />)

        expect(screen.getByRole('textbox', { name: label })).toBeDisabled()
    })

    it('gives the caller its input', () => {
        let held: HTMLInputElement | null = null
        render(
            <DecimalField
                label={label}
                value=""
                onValueChange={() => {}}
                inputRef={(element) => {
                    held = element
                }}
            />,
        )

        expect(held).toBe(screen.getByRole('textbox', { name: label }))
    })
})
