import { useState } from 'react'
import { SelectFilter } from '@/components/patterns/select-filter'
import type { CatalogueEntry } from '@/catalogue/types'

const options = [
    { value: 'apple', label: 'Apples' },
    { value: 'pear', label: 'Pears' },
    { value: 'plum', label: 'Plums' },
]

function Specimen({ initial }: { initial: string | null }) {
    const [value, setValue] = useState(initial)

    return (
        <SelectFilter
            aria-label="Fruit"
            allLabel="All fruit"
            options={options}
            value={value}
            onValueChange={setValue}
        />
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Select filter',
    specimens: [
        { name: 'All', Component: () => <Specimen initial={null} /> },
        { name: 'One chosen', Component: () => <Specimen initial="pear" /> },
    ],
}
