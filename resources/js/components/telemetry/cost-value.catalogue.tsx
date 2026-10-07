import { CostValue } from '@/components/telemetry/cost-value'
import type { Cost, SpanCost } from '@/api/types'
import type { CatalogueEntry } from '@/catalogue/types'

const costs: [string, Cost | SpanCost][] = [
    ['Estimated', { state: 'estimated', amount: 0.0466 }],
    ['Estimated, over $1', { state: 'estimated', amount: 1234.5 }],
    ['Estimated, a real zero', { state: 'estimated', amount: 0 }],
    ['Estimated, a sliver', { state: 'estimated', amount: 0.00001 }],
    ['Partial', { state: 'partial', amount: 0.0123 }],
    ['Unpriced', { state: 'unpriced', amount: null }],
    ['Pending', { state: 'pending', amount: null }],
    ['Pending, with an amount so far', { state: 'pending', amount: 0.0123 }],
    ['Not captured', { state: 'not_captured', amount: null }],
    ['Span, estimated', { state: 'estimated', amount: 0.0012 }],
    ['Span, unpriced', { state: 'unpriced', amount: null }],
]

export const catalogue: CatalogueEntry = {
    title: 'Cost value',
    specimens: costs.map(([name, cost]) => ({
        name,
        Component: () => <CostValue cost={cost} />,
    })),
}
