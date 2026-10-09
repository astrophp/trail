import { MemoryRouter } from 'react-router'
import { tracesLinkFor } from '@/api/traces-link'
import { AttentionCell } from '@/components/telemetry/attention-cell'
import { readAttention } from '@/components/telemetry/attention-items'
import { attentionFixture } from '@/components/telemetry/summary-fixtures'
import type { CatalogueEntry } from '@/catalogue/types'

const entries = readAttention(attentionFixture, '24h', tracesLinkFor)

export const catalogue: CatalogueEntry = {
    title: 'Attention cell',
    specimens: entries.map((entry, index) => ({
        name:
            index === 0
                ? 'Failed, with its issue kinds'
                : 'Without a breakdown',
        Component: () => (
            <MemoryRouter>
                <ul>
                    <AttentionCell entry={entry} />
                </ul>
            </MemoryRouter>
        ),
    })),
}
