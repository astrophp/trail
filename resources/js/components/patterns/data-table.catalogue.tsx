import { SearchXIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import {
    DataTable,
    type DataTableColumn,
    type DataTableSort,
} from '@/components/patterns/data-table'
import { EmptyState } from '@/components/patterns/empty-state'
import { Pagination } from '@/components/patterns/pagination'
import { RowLink } from '@/components/patterns/row-link'
import { Button } from '@/components/ui/button'
import type { CatalogueEntry } from '@/catalogue/types'

type Invoice = {
    id: string
    customer: string
    city: string
    status: string
    items: number
    total: number
}

const invoices: Invoice[] = [
    {
        id: 'INV-1042',
        customer: 'Alder & Finch',
        city: 'Lisbon',
        status: 'Paid',
        items: 12,
        total: 1840.5,
    },
    {
        id: 'INV-1041',
        customer: 'Birchwood Mills',
        city: 'Oslo',
        status: 'Open',
        items: 3,
        total: 312,
    },
    {
        id: 'INV-1040',
        customer: 'Cedar Row Bakery',
        city: 'Kyoto',
        status: 'Paid',
        items: 48,
        total: 96.25,
    },
    {
        id: 'INV-1039',
        customer: 'Dune Cycles',
        city: 'Perth',
        status: 'Overdue',
        items: 7,
        total: 4210,
    },
    {
        id: 'INV-1038',
        customer: 'Elm Street Books',
        city: 'Dublin',
        status: 'Open',
        items: 21,
        total: 735.8,
    },
    {
        id: 'INV-1037',
        customer: 'Fjord Outfitters',
        city: 'Bergen',
        status: 'Paid',
        items: 5,
        total: 2299,
    },
]

const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
})

const columns: DataTableColumn<Invoice>[] = [
    {
        id: 'customer',
        accessorKey: 'customer',
        header: 'Customer',
        enableSorting: true,
        meta: { rowHeader: true },
        cell: ({ row }) => (
            <div className="flex flex-col gap-1">
                <RowLink to={`/invoices/${row.original.id}`}>
                    {row.original.customer}
                </RowLink>
                <span className="text-caption text-muted-foreground">
                    {row.original.id}
                </span>
            </div>
        ),
    },
    {
        id: 'city',
        accessorKey: 'city',
        header: 'City',
        meta: { hideBelow: 'roomy' },
    },
    {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        meta: { hideBelow: 'wide' },
    },
    {
        id: 'items',
        accessorKey: 'items',
        header: 'Items',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'end', hideBelow: 'md' },
    },
    {
        id: 'total',
        accessorKey: 'total',
        header: 'Total',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'end' },
        cell: ({ row }) => money.format(row.original.total),
    },
    {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { align: 'end', hideBelow: 'xs' },
        cell: ({ row }) => (
            <Button variant="outline" size="sm" onClick={() => {}}>
                Remind
                <span className="sr-only"> {row.original.customer}</span>
            </Button>
        ),
    },
]

/** Sorts the made-up rows the way a server would. */
function sorted(sort: DataTableSort) {
    const key = sort.id as keyof Invoice
    const direction = sort.desc ? -1 : 1

    return [...invoices].sort((a, b) => {
        const left = a[key]
        const right = b[key]

        return (
            direction *
            (typeof left === 'number' && typeof right === 'number'
                ? left - right
                : String(left).localeCompare(String(right)))
        )
    })
}

function Specimen({
    withFooter = false,
    loading = false,
    busy = false,
    empty,
}: {
    withFooter?: boolean
    loading?: boolean
    busy?: boolean
    empty?: ReactNode
}) {
    const [sort, setSort] = useState<DataTableSort>({ id: 'total', desc: true })
    const [page, setPage] = useState(1)
    const rows = useMemo(() => sorted(sort), [sort])

    return (
        <MemoryRouter>
            <DataTable
                columns={columns}
                data={empty ? [] : rows}
                loading={loading}
                busy={busy}
                empty={empty}
                getRowId={(row) => row.id}
                sort={sort}
                onSortChange={setSort}
                caption="Invoices"
                footer={
                    withFooter ? (
                        <Pagination
                            page={page}
                            perPage={6}
                            total={38}
                            lastPage={7}
                            onPageChange={setPage}
                            noun={{ one: 'invoice', other: 'invoices' }}
                        />
                    ) : undefined
                }
            />
        </MemoryRouter>
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Data table',
    specimens: [
        {
            name: 'Sortable, aligned, with column priority and a row link (resize the window)',
            Component: () => <Specimen />,
        },
        {
            name: 'With a pagination footer',
            Component: () => <Specimen withFooter />,
        },
        {
            name: 'Loading: the header stays, the body is skeleton rows',
            Component: () => <Specimen loading />,
        },
        {
            name: 'Busy: the rows stay, dimmed, while a refresh runs',
            Component: () => <Specimen busy withFooter />,
        },
        {
            name: 'Empty: the slot sits below the header, and the footer is gone',
            Component: () => (
                <Specimen
                    withFooter
                    empty={
                        <EmptyState
                            icon={SearchXIcon}
                            title="No invoices in this period"
                            description="Invoices appear here as they are sent."
                        >
                            <Button variant="outline" size="sm">
                                Show the last year
                            </Button>
                        </EmptyState>
                    }
                />
            ),
        },
    ],
}
