import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FilterChips } from '@/components/patterns/filter-chips'

const labels = { a: 'Agent: Support', b: 'Errors only', c: 'Model: Sonnet' }
type Key = keyof typeof labels

function Controlled({
    initial = ['a', 'b', 'c'],
    removeLater = false,
}: {
    initial?: Key[]
    /** The parent removes the chip a render after the callback, as an async URL update would. */
    removeLater?: boolean
}) {
    const [keys, setKeys] = useState<Key[]>(initial)
    const fallback = useRef<HTMLButtonElement>(null)

    return (
        <>
            <button ref={fallback}>Filters</button>
            <FilterChips
                focusWhenEmpty={fallback}
                chips={keys.map((key) => ({
                    key,
                    label: labels[key],
                    onRemove: () =>
                        removeLater
                            ? void setTimeout(
                                  () =>
                                      setKeys((now) =>
                                          now.filter((k) => k !== key),
                                      ),
                                  0,
                              )
                            : setKeys(keys.filter((k) => k !== key)),
                }))}
                onClearAll={() => setKeys([])}
            />
        </>
    )
}

const remove = (label: string) =>
    screen.getByRole('button', { name: `Remove filter: ${label}` })

describe('FilterChips', () => {
    it('renders nothing when there are no chips', () => {
        const { container } = render(
            <FilterChips
                chips={[]}
                onClearAll={() => {}}
                focusWhenEmpty={{ current: null }}
            />,
        )

        expect(container).toBeEmptyDOMElement()
    })

    it('lists only the chips, each with a named remove button', () => {
        render(<Controlled />)

        const list = screen.getByRole('list', { name: 'Active filters' })

        expect(screen.getAllByRole('listitem')).toHaveLength(3)
        expect(list).not.toHaveTextContent('Clear all')
        expect(remove('Errors only')).toBeInTheDocument()
    })

    it('calls the chip’s own callback on remove, and onClearAll', async () => {
        const onRemove = vi.fn()
        const onClearAll = vi.fn()
        render(
            <FilterChips
                focusWhenEmpty={{ current: null }}
                chips={[
                    { key: 'a', label: 'One', onRemove: () => {} },
                    { key: 'b', label: 'Two', onRemove },
                ]}
                onClearAll={onClearAll}
            />,
        )

        await userEvent.click(remove('Two'))
        await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))

        expect(onRemove).toHaveBeenCalledTimes(1)
        expect(onClearAll).toHaveBeenCalledTimes(1)
    })

    it('moves focus to the next chip after removing a middle chip', async () => {
        render(<Controlled />)

        await userEvent.click(remove('Errors only'))

        expect(remove('Model: Sonnet')).toHaveFocus()
    })

    it('moves focus to the previous chip when the last chip is removed', async () => {
        render(<Controlled />)

        await userEvent.click(remove('Model: Sonnet'))

        expect(remove('Errors only')).toHaveFocus()
    })

    it('moves focus to focusWhenEmpty when the only chip is removed', async () => {
        render(<Controlled initial={['a']} />)

        await userEvent.click(remove('Agent: Support'))

        expect(screen.queryByRole('list')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Filters' })).toHaveFocus()
    })

    it('moves focus to focusWhenEmpty after Clear all', async () => {
        render(<Controlled />)

        await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))

        expect(screen.getByRole('button', { name: 'Filters' })).toHaveFocus()
    })

    it('still moves focus when the parent removes the chip a render later', async () => {
        render(<Controlled removeLater />)

        await userEvent.click(remove('Agent: Support'))
        await act(() => new Promise((resolve) => setTimeout(resolve, 5)))

        expect(remove('Errors only')).toHaveFocus()
    })

    it('does not move focus later when the chip was never removed', async () => {
        const { rerender } = render(
            <>
                <button>Elsewhere</button>
                <FilterChips
                    focusWhenEmpty={{ current: null }}
                    chips={[
                        { key: 'a', label: 'One', onRemove: () => {} },
                        { key: 'b', label: 'Two', onRemove: () => {} },
                    ]}
                    onClearAll={() => {}}
                />
            </>,
        )

        await userEvent.click(remove('One'))
        screen.getByRole('button', { name: 'Elsewhere' }).focus()

        // The chips change some other way: the pending move is dropped.
        rerender(
            <>
                <button>Elsewhere</button>
                <FilterChips
                    focusWhenEmpty={{ current: null }}
                    chips={[
                        { key: 'a', label: 'One', onRemove: () => {} },
                        { key: 'c', label: 'Three', onRemove: () => {} },
                    ]}
                    onClearAll={() => {}}
                />
            </>,
        )
        rerender(
            <>
                <button>Elsewhere</button>
                <FilterChips
                    focusWhenEmpty={{ current: null }}
                    chips={[{ key: 'c', label: 'Three', onRemove: () => {} }]}
                    onClearAll={() => {}}
                />
            </>,
        )

        expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus()
    })

    it('accepts a className', () => {
        const { container } = render(
            <FilterChips
                chips={[{ key: 'a', label: 'One', onRemove: () => {} }]}
                onClearAll={() => {}}
                focusWhenEmpty={{ current: null }}
                className="extra"
            />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
