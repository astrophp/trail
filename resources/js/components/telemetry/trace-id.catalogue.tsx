import { TraceId } from '@/components/telemetry/trace-id'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Trace id',
    specimens: [
        {
            name: 'Shortened',
            Component: () => (
                <TraceId id="019a3f2c-7b1e-7d4a-9c55-0e8f2a6b4d31" />
            ),
        },
        {
            name: 'Too short to shorten',
            Component: () => <TraceId id="tr-1" />,
        },
    ],
}
