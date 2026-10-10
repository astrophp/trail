import { MemoryRouter } from 'react-router'
import { tracesLink } from '@/api/traces-link'
import { MetricStrip } from '@/components/patterns/metric-strip'
import { DurationMetric } from '@/components/telemetry/duration-metric'
import {
    previousFixture,
    summaryFixture,
} from '@/components/telemetry/summary-fixtures'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Duration metric',
    specimens: [
        {
            name: 'Against the previous period',
            Component: () => (
                <MemoryRouter>
                    <MetricStrip>
                        <DurationMetric
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
                        <DurationMetric
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
