import { SearchUnitValue } from '@/components/telemetry/search-unit-value'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Search units',
    specimens: [
        {
            name: 'Fraction',
            Component: () => <SearchUnitValue count="0.100001" />,
        },
        { name: 'Zero', Component: () => <SearchUnitValue count="0.000000" /> },
        {
            name: 'Maximum',
            Component: () => <SearchUnitValue count="999999999999.999999" />,
        },
        {
            name: 'Not reported',
            Component: () => <SearchUnitValue count={null} />,
        },
        {
            name: 'Pending',
            Component: () => <SearchUnitValue count={null} pending />,
        },
    ],
}
