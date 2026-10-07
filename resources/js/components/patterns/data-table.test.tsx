import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
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
    extra: Partial<
        Pick<
            ComponentProps<typeof DataTable<Fruit>>,
            | 'footer'
            | 'className'
            | 'loading'
            | 'skeletonRows'
            | 'loadingLabel'
            | 'busy'
            | 'empty'
            | 'data'
        >
    > = {},
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

    describe('while the first load is on', () => {
        const skeletonRows = (container: HTMLElement) =>
            container.querySelectorAll('tbody tr')

        it('keeps the header and draws the given number of skeleton rows instead of data', () => {
            const { container } = renderTable(undefined, undefined, {
                loading: true,
                skeletonRows: 3,
            })

            expect(
                screen
                    .getAllByRole('columnheader')
                    .map((header) => header.textContent),
            ).toEqual(['Name', 'Weight', 'Origin', 'Actions'])
            expect(skeletonRows(container)).toHaveLength(3)
            expect(screen.queryByText('Apple')).not.toBeInTheDocument()
            // The header row is the only row assistive technology sees.
            expect(screen.getAllByRole('row')).toHaveLength(1)
        })

        it('draws eight rows by default, one skeleton per column', () => {
            const { container } = renderTable(undefined, undefined, {
                loading: true,
            })

            expect(skeletonRows(container)).toHaveLength(8)
            expect(
                container.querySelectorAll('tbody tr:first-child td'),
            ).toHaveLength(4)
            expect(
                container.querySelectorAll('[data-slot="skeleton"]'),
            ).toHaveLength(8 * 4)
        })

        it('says it is loading once, and hides the skeletons from assistive technology', () => {
            const { container } = renderTable(undefined, undefined, {
                loading: true,
            })

            expect(screen.getByRole('table')).toHaveAttribute(
                'aria-busy',
                'true',
            )
            expect(screen.getAllByRole('status')).toHaveLength(1)
            expect(screen.getByRole('status')).toHaveTextContent('Loading')
            expect(screen.getByRole('status')).toHaveClass('sr-only')
            expect(container.querySelector('tbody')).toHaveAttribute(
                'aria-hidden',
                'true',
            )
        })

        it('follows the alignment and priority of each column', () => {
            const { container } = renderTable(undefined, undefined, {
                loading: true,
                skeletonRows: 1,
            })
            const cells = container.querySelectorAll('tbody td')

            expect(cells[1]).toHaveClass('text-right')
            expect(cells[1].firstElementChild).toHaveClass('justify-end')
            expect(cells[2]).toHaveClass('roomy:table-cell')
            expect(cells[3]).toHaveClass('xs:table-cell')
        })

        it('uses what a column hints for its skeleton', () => {
            const hinted: DataTableColumn<Fruit>[] = [
                {
                    id: 'name',
                    accessorKey: 'name',
                    header: 'Name',
                    meta: { skeleton: <span>three lines here</span> },
                },
            ]

            const { container } = render(
                <DataTable
                    columns={hinted}
                    data={[]}
                    getRowId={(row) => row.id}
                    sort={{ id: 'name', desc: false }}
                    onSortChange={() => {}}
                    caption="Fruit"
                    loading
                    skeletonRows={2}
                />,
            )

            expect(container.querySelectorAll('tbody span')).toHaveLength(2)
        })

        it('does not pulse for people who prefer reduced motion', () => {
            const { container } = renderTable(undefined, undefined, {
                loading: true,
                skeletonRows: 1,
            })

            expect(
                container.querySelector('[data-slot="skeleton"]'),
            ).toHaveClass('motion-reduce:animate-none')
        })

        it('does not show the empty slot', () => {
            renderTable(undefined, undefined, {
                loading: true,
                data: [],
                empty: <p>Nothing here</p>,
            })

            expect(screen.queryByText('Nothing here')).not.toBeInTheDocument()
        })

        it('is not busy or loading once the rows are there', () => {
            renderTable()

            expect(screen.getByRole('table')).not.toHaveAttribute('aria-busy')
            expect(screen.getByRole('status')).toBeEmptyDOMElement()
        })

        it('takes the loading text from the caller', () => {
            renderTable(undefined, undefined, {
                loading: true,
                loadingLabel: 'Fetching fruit',
            })

            expect(screen.getByRole('status')).toHaveTextContent(
                'Fetching fruit',
            )
        })

        it('is loading, not dimmed, when it is also busy', () => {
            const { container } = renderTable(undefined, undefined, {
                loading: true,
                busy: true,
            })

            expect(screen.getByRole('status')).toHaveTextContent('Loading')
            expect(container.querySelector('tbody')).not.toHaveClass(
                'opacity-60',
            )
        })
    })

    describe('while a refresh is on', () => {
        it('keeps the rows, dimmed, and marks the table busy', () => {
            const { container } = renderTable(undefined, undefined, {
                busy: true,
            })

            expect(screen.getByRole('cell', { name: '182' })).toBeVisible()
            expect(screen.getByRole('table')).toHaveAttribute(
                'aria-busy',
                'true',
            )
            expect(container.querySelector('tbody')).toHaveClass('opacity-60')
            expect(screen.getByRole('status')).toHaveTextContent('Loading')
        })

        it('dims the footer with the rows', () => {
            renderTable(undefined, undefined, {
                busy: true,
                footer: <p>Page 1 of 1</p>,
            })

            expect(screen.getByText('Page 1 of 1').parentElement).toHaveClass(
                'opacity-60',
            )
        })

        it('does not dim the empty slot, only rows', () => {
            const { container } = renderTable(undefined, undefined, {
                busy: true,
                data: [],
                empty: <p>Nothing here</p>,
            })

            expect(screen.getByText('Nothing here')).toBeVisible()
            expect(container.firstElementChild).not.toHaveClass('opacity-60')
            expect(
                screen.getByText('Nothing here').closest('.opacity-60'),
            ).toBeNull()
        })
    })

    describe('the status region', () => {
        it('stays mounted and only its text changes', () => {
            const { rerender } = renderTable()
            const status = screen.getByRole('status')

            expect(status).toBeEmptyDOMElement()

            const again = (props: { loading?: boolean; busy?: boolean }) =>
                rerender(
                    <MemoryRouter>
                        <DataTable
                            columns={columns}
                            data={fruit}
                            getRowId={(row) => row.id}
                            sort={{ id: 'name', desc: false }}
                            onSortChange={() => {}}
                            caption="Fruit"
                            {...props}
                        />
                    </MemoryRouter>,
                )

            again({ busy: true })
            expect(screen.getByRole('status')).toBe(status)
            expect(status).toHaveTextContent('Loading')

            again({ loading: true })
            expect(screen.getByRole('status')).toBe(status)
            expect(status).toHaveTextContent('Loading')

            again({})
            expect(screen.getByRole('status')).toBe(status)
            expect(status).toBeEmptyDOMElement()
        })
    })

    describe('when there is nothing to show', () => {
        it('renders the empty slot inside the card, below the header, with no footer', () => {
            const { container } = renderTable(undefined, undefined, {
                data: [],
                empty: <p>Nothing here</p>,
                footer: <p>Page 1 of 1</p>,
            })

            expect(container.firstElementChild).toContainElement(
                screen.getByText('Nothing here'),
            )
            expect(screen.getAllByRole('columnheader')).toHaveLength(4)
            expect(screen.queryByText('Page 1 of 1')).not.toBeInTheDocument()
        })

        it('keeps the footer when no empty slot is given', () => {
            renderTable(undefined, undefined, {
                data: [],
                footer: <p>Page 1 of 1</p>,
            })

            expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
        })

        it('does not render the slot while there are rows', () => {
            renderTable(undefined, undefined, {
                empty: <p>Nothing here</p>,
            })

            expect(screen.queryByText('Nothing here')).not.toBeInTheDocument()
        })
    })
})
