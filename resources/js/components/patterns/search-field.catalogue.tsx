import { useState } from 'react'
import { SearchField } from '@/components/patterns/search-field'
import type { CatalogueEntry } from '@/catalogue/types'

function Specimen({
    initial = '',
    shortcutHint,
    maxLength,
}: {
    initial?: string
    shortcutHint?: string
    maxLength?: number
}) {
    const [value, setValue] = useState(initial)

    return (
        <SearchField
            aria-label="Search fruit"
            placeholder="Search fruit"
            value={value}
            onValueChange={setValue}
            shortcutHint={shortcutHint}
            maxLength={maxLength}
        />
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Search field',
    specimens: [
        { name: 'Empty', Component: () => <Specimen /> },
        {
            name: 'With a shortcut hint',
            Component: () => <Specimen shortcutHint="/" />,
        },
        {
            name: 'With a maximum length of 12 (an input prop passed through)',
            Component: () => <Specimen maxLength={12} />,
        },
        {
            name: 'With text (clear button)',
            Component: () => <Specimen initial="apple" />,
        },
    ],
}
