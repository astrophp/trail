import { useState } from 'react'
import { ViewSwitch } from '@/components/patterns/view-switch'
import type { CatalogueEntry } from '@/catalogue/types'

const views = [
    { value: 'tree', label: 'Tree' },
    { value: 'raw', label: 'Raw' },
] as const

export const catalogue: CatalogueEntry = {
    title: 'View switch',
    specimens: [
        {
            name: 'Two views',
            Component: () => {
                const [view, setView] = useState<'tree' | 'raw'>('tree')

                return (
                    <ViewSwitch
                        label="arguments view"
                        options={views}
                        value={view}
                        onValueChange={setView}
                    />
                )
            },
        },
    ],
}
