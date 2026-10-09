import { MemoryRouter } from 'react-router'
import { tracesLink } from '@/api/traces-link'
import { MetricStrip } from '@/components/patterns/metric-strip'
import { CostMetric } from '@/components/telemetry/cost-metric'
import {
    previousFixture,
    summaryFixture,
} from '@/components/telemetry/summary-fixtures'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Cost metric',
    specimens: [
        {
            name: 'Against the previous period',
            Component: () => (
                <MemoryRouter>
                    <MetricStrip>
                        <CostMetric
                            summary={summaryFixture}
                            previous={previousFixture}
                            range="24h"
                            link={tracesLink}
                        />
                    </MetricStrip>
                </MemoryRouter>
            ),
        },
        {
            name: 'No previous period',
            Component: () => (
                <MemoryRouter>
                    <MetricStrip>
                        <CostMetric
                            summary={summaryFixture}
                            previous={null}
                            range="24h"
                            link={tracesLink}
                        />
                    </MetricStrip>
                </MemoryRouter>
            ),
        },
    ],
}
