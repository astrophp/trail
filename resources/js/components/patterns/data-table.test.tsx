import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import {
    DataTable,
    type DataTableColumn,
    type DataTableSort,
} from '@/components/patterns/data-table'
import { RowLink } from '@/components/patterns/row-link'

const onEdit = vi.fn()

type Fruit = { id: string; name: string; weight: number; origin: string }

const fruit: Fruit[] = [
    { id: 'a', name: 'Apple', weight: 182, origin: 'Poland' },
    { id: 'b', name: 'Banana', weight: 118, origin: 'Ecuador' },
]

const columns: DataTableColumn<Fruit>[] = [
    {
        id: 'name',
        accessorKey: 'name',
        header: 'Name',
        enableSorting: true,
        meta: { rowHeader: true },
        cell: ({ row }) => (
            <RowLink to={`/fruit/${row.original.id}`}>
                {row.original.name}
            </RowLink>
        ),
    },
    {
        id: 'weight',
        accessorKey: 'weight',
        header: 'Weight',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'end' },
    },
    {
        id: 'origin',
        accessorKey: 'origin',
        header: 'Origin',
        meta: { hideBelow: 'roomy' },
    },
    {
        id: 'actions',
        header: 'Actions',
        meta: { hideBelow: 'xs' },
        cell: () => <button onClick={onEdit}>Edit</button>,
    },
]

function renderTable(
    sort: DataTableSort = { id: 'name', desc: false },
    onSortChange: (sort: DataTableSort) => void = () => {},
    extra: { footer?: React.ReactNode; className?: string } = {},
) {
    return render(
        <MemoryRouter>
            <DataTable
                columns={columns}
                data={fruit}
                getRowId={(row) => row.id}
                sort={sort}
                onSortChange={onSortChange}
                caption="Fruit"
                {...extra}
            />
        </MemoryRouter>,
    )
}

describe('DataTable', () => {
    it('renders the headers and cells from the column definitions', () => {
        renderTable()

        expect(
            screen
                .getAllByRole('columnheader')
                .map((header) => header.textContent),
        ).toEqual(['Name', 'Weight', 'Origin', 'Actions'])
        expect(screen.getByRole('cell', { name: '182' })).toBeInTheDocument()
        expect(
            screen.getByRole('cell', { name: 'Ecuador' }),
        ).toBeInTheDocument()
    })

    it('names the table with its caption', () => {
        renderTable()

        expect(screen.getByRole('table', { name: 'Fruit' })).toBeInTheDocument()
        expect(screen.getByText('Fruit')).toHaveClass('sr-only')
    })

    it('aligns a column to the end and drops secondary columns by priority', () => {
        renderTable()

        // jsdom cannot evaluate breakpoints: this only checks the classes are applied.
        expect(screen.getByRole('cell', { name: '182' })).toHaveClass(
            'text-right',
        )
        expect(screen.getByRole('cell', { name: 'Poland' })).toHaveClass(
            'roomy:table-cell',
        )
    })

    it('marks the sorted column and offers the others', () => {
        renderTable({ id: 'weight', desc: true })

        expect(
            screen.getByRole('columnheader', { name: /Name/ }),
        ).toHaveAttribute('aria-sort', 'none')
        expect(
            screen.getByRole('columnheader', { name: /Weight/ }),
        ).toHaveAttribute('aria-sort', 'descending')
    })

    it('reads ascending when the sort is ascending', () => {
        renderTable({ id: 'name', desc: false })

        expect(
            screen.getByRole('columnheader', { name: /Name/ }),
        ).toHaveAttribute('aria-sort', 'ascending')
    })

    it('sorts by another column in its first direction', async () => {
        const onSortChange = vi.fn()
        renderTable({ id: 'name', desc: false }, onSortChange)

        await userEvent.click(screen.getByRole('button', { name: 'Weight' }))

        expect(onSortChange).toHaveBeenLastCalledWith({
            id: 'weight',
            desc: true,
        })
    })

    it('sorts by a column that says nothing in ascending order first', async () => {
        const onSortChange = vi.fn()
        renderTable({ id: 'weight', desc: true }, onSortChange)

        await userEvent.click(screen.getByRole('button', { name: 'Name' }))

        expect(onSortChange).toHaveBeenLastCalledWith({
            id: 'name',
            desc: false,
        })
    })

    it('flips the direction when the sorted column is clicked, both ways', async () => {
        const onSortChange = vi.fn()
        const { rerender } = renderTable(
            { id: 'weight', desc: true },
            onSortChange,
        )

        await userEvent.click(screen.getByRole('button', { name: 'Weight' }))
        expect(onSortChange).toHaveBeenLastCalledWith({
            id: 'weight',
            desc: false,
        })

        rerender(
            <MemoryRouter>
                <DataTable
                    columns={columns}
                    data={fruit}
                    getRowId={(row) => row.id}
                    sort={{ id: 'weight', desc: false }}
                    onSortChange={onSortChange}
                    caption="Fruit"
                />
            </MemoryRouter>,
        )

        await userEvent.click(screen.getByRole('button', { name: 'Weight' }))
        expect(onSortChange).toHaveBeenLastCalledWith({
            id: 'weight',
            desc: true,
        })
    })

    it('sorts from the keyboard', async () => {
        const onSortChange = vi.fn()
        renderTable({ id: 'name', desc: false }, onSortChange)

        screen.getByRole('button', { name: 'Weight' }).focus()
        await userEvent.keyboard('{Enter}')
        await userEvent.keyboard(' ')

        expect(onSortChange).toHaveBeenNthCalledWith(1, {
            id: 'weight',
            desc: true,
        })
        expect(onSortChange).toHaveBeenNthCalledWith(2, {
            id: 'weight',
            desc: true,
        })
    })

    it('gives a column that cannot sort no button', () => {
        renderTable()

        const header = screen.getByRole('columnheader', { name: 'Origin' })

        expect(within(header).queryByRole('button')).not.toBeInTheDocument()
        expect(header).not.toHaveAttribute('aria-sort')
    })

    it('makes the cell of a row header a row header', () => {
        renderTable()

        expect(
            screen.getAllByRole('rowheader').map((cell) => cell.textContent),
        ).toEqual(['Apple', 'Banana'])
        expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute(
            'scope',
            'col',
        )
        expect(screen.getAllByRole('rowheader')[0]).toHaveAttribute(
            'scope',
            'row',
        )
    })

    it('reaches a row link by keyboard, and stretches it over the row', async () => {
        renderTable()

        const link = screen.getByRole('link', { name: 'Apple' })

        expect(link).toHaveAttribute('href', '/fruit/a')

        await userEvent.tab()
        await userEvent.tab()
        await userEvent.tab()
        // Sort buttons first (name, weight), then the first row's link.
        expect(link).toHaveFocus()
    })

    it('gives another control in the row the click, not the row link', async () => {
        onEdit.mockClear()
        renderTable()

        await userEvent.click(
            screen.getAllByRole('button', { name: 'Edit' })[0],
        )

        expect(onEdit).toHaveBeenCalledTimes(1)
        expect(screen.getAllByRole('cell', { name: 'Edit' })[0]).toHaveClass(
            '[&_button]:z-1',
        )
    })

    it('shows the footer inside the card, and accepts a className', () => {
        const { container } = renderTable(undefined, undefined, {
            footer: <p>Page 1 of 1</p>,
            className: 'extra',
        })

        expect(container.firstElementChild).toHaveClass('extra')
        expect(
            container.firstElementChild?.contains(
                screen.getByText('Page 1 of 1'),
            ),
        ).toBe(true)
    })
})
