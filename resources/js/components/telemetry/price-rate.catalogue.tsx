import { PriceRate } from '@/components/telemetry/price-rate'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Price rate',
    specimens: [
        { name: 'A rate', Component: () => <PriceRate rate={3.75} /> },
        {
            name: 'A small rate',
            Component: () => <PriceRate rate={0.000001} />,
        },
        {
            name: 'A free rate (a real zero)',
            Component: () => <PriceRate rate={0} />,
        },
        {
            name: 'No rate (unknown, not free)',
            Component: () => <PriceRate rate={null} />,
        },
    ],
}
