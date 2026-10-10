import { MemoryRouter } from 'react-router'
import { tracesLinkFor } from '@/api/traces-link'
import { AttentionSection } from '@/components/telemetry/attention-section'
import { attentionFixture } from '@/components/telemetry/summary-fixtures'
import type { CatalogueEntry } from '@/catalogue/types'

const common = { range: '24h', linkFor: tracesLinkFor } as const

export const catalogue: CatalogueEntry = {
    title: 'Attention section',
    specimens: [
        {
            name: 'Items',
            Component: () => (
                <MemoryRouter>
                    <AttentionSection {...common} items={attentionFixture} />
                </MemoryRouter>
            ),
        },
        {
            name: 'Nothing needs attention',
            Component: () => (
                <MemoryRouter>
                    <AttentionSection {...common} items={[]} />
                </MemoryRouter>
            ),
        },
        {
            name: 'Loading',
            Component: () => (
                <MemoryRouter>
                    <AttentionSection {...common} items={undefined} />
                </MemoryRouter>
            ),
        },
        {
            name: 'The previous view, while the next loads',
            Component: () => (
                <MemoryRouter>
                    <AttentionSection
                        {...common}
                        items={attentionFixture}
                        busy
                    />
                </MemoryRouter>
            ),
        },
        {
            name: 'Failed',
            Component: () => (
                <MemoryRouter>
                    <AttentionSection
                        {...common}
                        items={undefined}
                        failure={{
                            message: 'The server could not be reached.',
                            onRetry: () => {},
                        }}
                    />
                </MemoryRouter>
            ),
        },
    ],
}
