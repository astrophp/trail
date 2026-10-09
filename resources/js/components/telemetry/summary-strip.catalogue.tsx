import { MemoryRouter } from 'react-router'
import { tracesLink } from '@/api/traces-link'
import { SummaryStrip } from '@/components/telemetry/summary-strip'
import {
    previousFixture,
    summaryFixture,
} from '@/components/telemetry/summary-fixtures'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Summary strip',
    specimens: [
        {
            name: 'With a percentile, against the previous period',
            Component: () => (
                <MemoryRouter>
                    <SummaryStrip
                        summary={summaryFixture}
                        previous={previousFixture}
                        range="24h"
                        link={tracesLink}
                    />
                </MemoryRouter>
            ),
        },
        {
            name: 'Few measured runs (the average under its own name), no previous period, a detail under the count',
            Component: () => (
                <MemoryRouter>
                    <SummaryStrip
                        summary={{
                            ...summaryFixture,
                            duration: {
                                ...summaryFixture.duration,
                                p95_ms: null,
                                measured: 8,
                            },
                        }}
                        previous={null}
                        range="7d"
                        link={tracesLink}
                        tracesDetail="12 delegated runs"
                    />
                </MemoryRouter>
            ),
        },
        {
            name: 'Links narrowed to one agent',
            Component: () => (
                <MemoryRouter>
                    <SummaryStrip
                        summary={summaryFixture}
                        previous={previousFixture}
                        range="1h"
                        link={(range, filters) =>
                            tracesLink(range, filters, { agent: 'Support' })
                        }
                    />
                </MemoryRouter>
            ),
        },
    ],
}
