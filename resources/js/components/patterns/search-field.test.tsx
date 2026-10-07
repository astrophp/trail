import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SearchField } from '@/components/patterns/search-field'

function Controlled({
    initial = '',
    onValueChange = () => {},
    shortcutHint,
}: {
    initial?: string
    onValueChange?: (value: string) => void
    shortcutHint?: string
}) {
    const [value, setValue] = useState(initial)

    return (
        <SearchField
            aria-label="Search traces"
            placeholder="Search"
            value={value}
            shortcutHint={shortcutHint}
            className="extra"
            onValueChange={(next) => {
                setValue(next)
                onValueChange(next)
            }}
        />
    )
}

function WithInputRef() {
    const ref = useRef<HTMLInputElement>(null)

    return (
        <>
            <SearchField
                aria-label="Search traces"
                value=""
                onValueChange={() => {}}
                inputRef={ref}
            />
            <button type="button" onClick={() => ref.current?.focus()}>
                Focus the search
            </button>
        </>
    )
}

describe('SearchField', () => {
    it('hands its input to the caller through inputRef', async () => {
        render(<WithInputRef />)
        await userEvent.click(
            screen.getByRole('button', { name: 'Focus the search' }),
        )

        expect(
            screen.getByRole('searchbox', { name: 'Search traces' }),
        ).toHaveFocus()
    })

    it('is a search box with a name and a placeholder', () => {
        render(<Controlled />)

        const input = screen.getByRole('searchbox', { name: 'Search traces' })

        expect(input).toHaveAttribute('type', 'search')
        expect(input).toHaveAttribute('placeholder', 'Search')
    })

    it('reports what is typed', async () => {
        const onValueChange = vi.fn()
        render(<Controlled onValueChange={onValueChange} />)

        await userEvent.type(screen.getByRole('searchbox'), 'ab')

        expect(onValueChange).toHaveBeenNthCalledWith(1, 'a')
        expect(onValueChange).toHaveBeenNthCalledWith(2, 'ab')
        expect(screen.getByRole('searchbox')).toHaveValue('ab')
    })

    it('keeps focus in the same input while the value changes', async () => {
        render(<Controlled />)

        const input = screen.getByRole('searchbox')

        await userEvent.click(input)
        await userEvent.keyboard('hello')

        expect(screen.getByRole('searchbox')).toBe(input)
        expect(input).toHaveFocus()
    })

    it('passes standard input props to the input', async () => {
        const onBlur = vi.fn()
        const onKeyDown = vi.fn()
        const onCompositionStart = vi.fn()

        render(
            <SearchField
                aria-label="Search traces"
                value="abc"
                onValueChange={() => {}}
                maxLength={5}
                onBlur={onBlur}
                onKeyDown={onKeyDown}
                onCompositionStart={onCompositionStart}
            />,
        )

        const input = screen.getByRole('searchbox')

        expect(input).toHaveAttribute('maxlength', '5')

        await userEvent.click(input)
        await userEvent.keyboard('{Enter}')
        fireEvent.compositionStart(input)
        await userEvent.tab()

        expect(onKeyDown).toHaveBeenCalled()
        expect(onCompositionStart).toHaveBeenCalled()
        expect(onBlur).toHaveBeenCalled()
    })

    it('shows the clear button only when there is text', async () => {
        render(<Controlled />)

        expect(
            screen.queryByRole('button', { name: 'Clear search' }),
        ).not.toBeInTheDocument()

        await userEvent.type(screen.getByRole('searchbox'), 'x')

        expect(
            screen.getByRole('button', { name: 'Clear search' }),
        ).toBeInTheDocument()
    })

    it('clears the text and returns focus to the input', async () => {
        const onValueChange = vi.fn()
        render(<Controlled initial="abc" onValueChange={onValueChange} />)

        await userEvent.click(
            screen.getByRole('button', { name: 'Clear search' }),
        )

        expect(onValueChange).toHaveBeenLastCalledWith('')
        expect(screen.getByRole('searchbox')).toHaveValue('')
        expect(screen.getByRole('searchbox')).toHaveFocus()
        expect(
            screen.queryByRole('button', { name: 'Clear search' }),
        ).not.toBeInTheDocument()
    })

    it('shows the shortcut hint while empty, in a kbd', async () => {
        render(<Controlled shortcutHint="/" />)

        const hint = screen.getByText('/')

        expect(hint.tagName).toBe('KBD')
        // Decoration: hidden from assistive technology, and announced on the input instead.
        expect(hint).toHaveAttribute('aria-hidden', 'true')
        expect(screen.getByRole('searchbox')).toHaveAttribute(
            'aria-keyshortcuts',
            '/',
        )
        expect(screen.getByRole('searchbox').closest('div')).toHaveClass(
            'extra',
        )

        await userEvent.type(screen.getByRole('searchbox'), 'a')

        expect(screen.queryByText('/')).not.toBeInTheDocument()
    })
})
