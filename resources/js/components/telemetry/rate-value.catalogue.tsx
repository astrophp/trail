import { RateValue } from '@/components/telemetry/rate-value'
import type { CatalogueEntry } from '@/catalogue/types'

const rates: [string, number | null][] = [
    ['A share', 0.0357142857],
    ['A real zero', 0],
    ['Under a tenth of a percent', 0.0002],
    ['Every finished run', 1],
    ['No finished runs', null],
]

export const catalogue: CatalogueEntry = {
    title: 'Rate value',
    specimens: rates.map(([name, rate]) => ({
        name,
        Component: () => <RateValue rate={rate} />,
    })),
}
