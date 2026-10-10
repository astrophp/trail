import { useState } from 'react'
import { Pagination } from '@/components/patterns/pagination'
import type { CatalogueEntry } from '@/catalogue/types'

const noun = { one: 'invoice', other: 'invoices' }

function Specimen({
    total,
    perPage = 12,
    initial = 1,
}: {
    total: number
    perPage?: number
    initial?: number
}) {
    const [page, setPage] = useState(initial)

    return (
        <div className="rounded-xl border px-4 py-3">
            <Pagination
                page={page}
                perPage={perPage}
                total={total}
                lastPage={Math.max(Math.ceil(total / perPage), 1)}
                onPageChange={setPage}
                noun={noun}
            />
        </div>
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Pagination',
    specimens: [
        { name: 'First page', Component: () => <Specimen total={1284} /> },
        {
            name: 'Last page, partial',
            Component: () => (
                <Specimen total={1284} perPage={25} initial={52} />
            ),
        },
        { name: 'One page', Component: () => <Specimen total={7} /> },
        { name: 'Exactly one', Component: () => <Specimen total={1} /> },
        { name: 'None', Component: () => <Specimen total={0} /> },
    ],
}
