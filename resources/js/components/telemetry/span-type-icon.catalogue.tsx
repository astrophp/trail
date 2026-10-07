import { SpanTypeIcon } from '@/components/telemetry/span-type-icon'
import type { SpanType } from '@/api/types'
import type { CatalogueEntry } from '@/catalogue/types'

const types: SpanType[] = ['agent', 'step', 'tool', 'embedding']

export const catalogue: CatalogueEntry = {
    title: 'Span type icon',
    specimens: types.map((type) => ({
        name: type,
        Component: () => <SpanTypeIcon type={type} />,
    })),
}
