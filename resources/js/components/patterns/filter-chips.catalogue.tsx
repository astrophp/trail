import { useRef, useState } from 'react'
import { FilterChips } from '@/components/patterns/filter-chips'
import type { CatalogueEntry } from '@/catalogue/types'

const all = [
    { key: 'fruit', label: 'Fruit: Pears' },
    { key: 'bruised', label: 'Bruised only' },
    { key: 'range', label: 'Last 7 days' },
]

function Specimen() {
    const [keys, setKeys] = useState(all.map((chip) => chip.key))
    const restore = useRef<HTMLButtonElement>(null)

    return (
        <div className="flex min-h-8 flex-col gap-2">
            <FilterChips
                focusWhenEmpty={restore}
                chips={all
                    .filter((chip) => keys.includes(chip.key))
                    .map((chip) => ({
                        ...chip,
                        onRemove: () =>
                            setKeys(keys.filter((key) => key !== chip.key)),
                    }))}
                onClearAll={() => setKeys([])}
            />
            {keys.length === 0 ? (
                <button
                    ref={restore}
                    className="w-fit text-ui text-primary-ink underline"
                    onClick={() => setKeys(all.map((chip) => chip.key))}
                >
                    Bring the chips back
                </button>
            ) : null}
        </div>
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Filter chips',
    specimens: [{ name: 'Removable', Component: Specimen }],
}
