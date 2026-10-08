import { TokenCount } from '@/components/telemetry/token-count'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Token count',
    specimens: [
        { name: 'Count', Component: () => <TokenCount count={1_234} /> },
        { name: 'Zero', Component: () => <TokenCount count={0} /> },
        { name: 'Not reported', Component: () => <TokenCount count={null} /> },
        {
            name: 'Pending',
            Component: () => <TokenCount count={null} pending />,
        },
    ],
}
