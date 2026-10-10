import { BusyRegion } from '@/components/patterns/busy-region'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Busy region',
    specimens: [
        {
            name: 'Current',
            Component: () => (
                <BusyRegion busy={false}>
                    <p>The figures of this view.</p>
                </BusyRegion>
            ),
        },
        {
            name: 'The previous view, while the next loads',
            Component: () => (
                <BusyRegion busy label="Loading the figures">
                    <p>The figures of the previous view.</p>
                </BusyRegion>
            ),
        },
    ],
}
