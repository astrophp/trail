import { MetricStripSkeleton } from '@/components/patterns/metric-strip-skeleton'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Metric strip skeleton',
    specimens: [
        {
            name: 'Four',
            Component: () => <MetricStripSkeleton count={4} />,
        },
        {
            name: 'Five, in a narrow container',
            Component: () => (
                <MetricStripSkeleton count={5} className="max-w-90" />
            ),
        },
    ],
}
