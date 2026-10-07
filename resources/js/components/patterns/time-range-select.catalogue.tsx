import { useState } from 'react'
import { TimeRangeSelect } from '@/components/patterns/time-range-select'
import type { CatalogueEntry } from '@/catalogue/types'
import type { TimeRangePreset } from '@/lib/time-range'

function Specimen({ initial }: { initial: TimeRangePreset }) {
    const [value, setValue] = useState(initial)

    return <TimeRangeSelect value={value} onValueChange={setValue} />
}

export const catalogue: CatalogueEntry = {
    title: 'Time range select',
    specimens: [
        { name: 'Last 24 hours', Component: () => <Specimen initial="24h" /> },
        { name: 'Last hour', Component: () => <Specimen initial="1h" /> },
    ],
}
