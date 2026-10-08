import { MemoryRouter } from 'react-router'
import { Change } from '@/components/patterns/change'
import { Metric } from '@/components/patterns/metric'
import { MetricStrip } from '@/components/patterns/metric-strip'
import { CostValue } from '@/components/telemetry/cost-value'
import { formatCount } from '@/lib/format'
import type { CatalogueEntry } from '@/catalogue/types'

const caption = 'vs previous 24h'

function Four() {
    return (
        <>
            <Metric
                label="Traces"
                to="/traces"
                change={
                    <Change
                        mode="relative"
                        polarity="neutral"
                        current={1284}
                        previous={1140}
                        caption={caption}
                    />
                }
            >
                {formatCount(1284)}
            </Metric>
            <Metric
                label="Failed"
                to="/traces?status=failed"
                change={
                    <Change
                        mode="relative"
                        polarity="up-is-bad"
                        current={27}
                        previous={12}
                        caption={caption}
                    />
                }
                detail="2.1% of runs"
            >
                27
            </Metric>
            <Metric
                label="Estimated cost"
                change={
                    <Change
                        mode="relative"
                        polarity="up-is-bad"
                        current={12.4}
                        previous={null}
                    />
                }
                detail="8 unpriced"
            >
                <CostValue cost={{ state: 'estimated', amount: 12.4 }} />
            </Metric>
            <Metric label="p95 duration" detail="Not captured on 3 runs">
                <CostValue cost={{ state: 'not_captured', amount: null }} />
            </Metric>
        </>
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Metric strip',
    specimens: [
        {
            name: 'Four metrics (links, changes, details; the last has no value and no change)',
            Component: () => (
                <MemoryRouter>
                    <MetricStrip>
                        <Four />
                    </MetricStrip>
                </MemoryRouter>
            ),
        },
        {
            name: 'Five metrics (an odd last one spans both columns when narrow)',
            Component: () => (
                <MemoryRouter>
                    <MetricStrip>
                        <Four />
                        <Metric label="Conversations">86</Metric>
                    </MetricStrip>
                </MemoryRouter>
            ),
        },
        {
            name: 'Narrow container, four metrics',
            Component: () => (
                <MemoryRouter>
                    <MetricStrip className="max-w-90">
                        <Four />
                    </MetricStrip>
                </MemoryRouter>
            ),
        },
        {
            name: 'Narrow container, five metrics',
            Component: () => (
                <MemoryRouter>
                    <MetricStrip className="max-w-90">
                        <Four />
                        <Metric label="Conversations">86</Metric>
                    </MetricStrip>
                </MemoryRouter>
            ),
        },
    ],
}
