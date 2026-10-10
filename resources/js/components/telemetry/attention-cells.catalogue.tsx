import { MemoryRouter } from 'react-router'
import { tracesLinkFor } from '@/api/traces-link'
import { AttentionCells } from '@/components/telemetry/attention-cells'
import { attentionFixture } from '@/components/telemetry/summary-fixtures'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Attention cells',
    specimens: [
        {
            name: 'A failed item with its issue kinds, and an unpriced one',
            Component: () => (
                <MemoryRouter>
                    <div className="@container">
                        <AttentionCells
                            items={attentionFixture}
                            range="24h"
                            linkFor={tracesLinkFor}
                        />
                    </div>
                </MemoryRouter>
            ),
        },
        {
            name: 'An item the client cannot link is drawn as one that could not be shown',
            Component: () => (
                <MemoryRouter>
                    <div className="@container">
                        <AttentionCells
                            items={[
                                {
                                    kind: 'unpriced',
                                    count: 4,
                                    latest_at: null,
                                    filters: { not_a_filter: '1' },
                                    breakdown: [],
                                },
                            ]}
                            range="24h"
                            linkFor={tracesLinkFor}
                        />
                    </div>
                </MemoryRouter>
            ),
        },
    ],
}
