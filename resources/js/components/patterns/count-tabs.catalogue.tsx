import { useState, type ReactNode } from 'react'
import { CountTabs, type CountTab } from '@/components/patterns/count-tabs'
import type { CatalogueEntry } from '@/catalogue/types'

const tabs: CountTab[] = [
    { value: 'all', label: 'All', count: 1284 },
    { value: 'ripe', label: 'Ripe', count: 1190 },
    { value: 'bruised', label: 'Bruised', count: 0 },
    { value: 'unsorted', label: 'Unsorted' },
]

function Specimen({
    list = tabs,
    toolbar,
}: {
    list?: CountTab[]
    toolbar?: ReactNode
}) {
    const [value, setValue] = useState(list[0].value)

    return (
        <CountTabs
            aria-label="Fruit"
            tabs={list}
            value={value}
            onValueChange={setValue}
            toolbar={toolbar}
        >
            <p className="pt-3 text-ui text-muted-foreground">
                The {value} view.
            </p>
        </CountTabs>
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Count tabs',
    specimens: [
        {
            name: 'Counts, a zero and an unknown count',
            Component: () => <Specimen />,
        },
        {
            name: 'With a toolbar between the tabs and the panel',
            Component: () => (
                <Specimen
                    toolbar={
                        <p className="py-3 text-ui text-muted-foreground">
                            Controls for every tab.
                        </p>
                    }
                />
            ),
        },
        {
            name: 'Overflowing row (scrolls sideways)',
            Component: () => (
                <div className="w-60">
                    <Specimen />
                </div>
            ),
        },
    ],
}
