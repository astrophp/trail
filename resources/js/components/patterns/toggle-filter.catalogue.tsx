import { AlertTriangleIcon } from 'lucide-react'
import { useState } from 'react'
import { ToggleFilter } from '@/components/patterns/toggle-filter'
import type { CatalogueEntry } from '@/catalogue/types'

function Specimen({ initial, count }: { initial: boolean; count?: number }) {
    const [pressed, setPressed] = useState(initial)

    return (
        <ToggleFilter
            pressed={pressed}
            onPressedChange={setPressed}
            count={count}
        >
            <AlertTriangleIcon aria-hidden="true" />
            Bruised
        </ToggleFilter>
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Toggle filter',
    specimens: [
        {
            name: 'Off and on',
            Component: () => (
                <div className="flex flex-wrap items-center gap-2">
                    <Specimen initial={false} />
                    <Specimen initial />
                </div>
            ),
        },
        {
            name: 'With a count',
            Component: () => (
                <div className="flex flex-wrap items-center gap-2">
                    <Specimen initial={false} count={12} />
                    <Specimen initial count={1204} />
                    <Specimen initial={false} count={0} />
                </div>
            ),
        },
    ],
}
