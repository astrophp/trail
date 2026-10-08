import { MemoryRouter } from 'react-router'
import { Change } from '@/components/patterns/change'
import { Metric } from '@/components/patterns/metric'
import { MetricStrip } from '@/components/patterns/metric-strip'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Metric',
    specimens: [
        {
            name: 'Label and value',
            Component: () => (
                <MetricStrip className="max-w-xs">
                    <Metric label="Conversations">86</Metric>
                </MetricStrip>
            ),
        },
        {
            name: 'With a change and a detail',
            Component: () => (
                <MetricStrip className="max-w-xs">
                    <Metric
                        label="Failed"
                        change={
                            <Change
                                mode="relative"
                                polarity="up-is-bad"
                                current={27}
                                previous={12}
                                caption="vs previous 24h"
                            />
                        }
                        detail="2.1% of runs"
                    >
                        27
                    </Metric>
                </MetricStrip>
            ),
        },
        {
            name: 'A link (hover it, Tab to it: the whole metric is the target)',
            Component: () => (
                <MemoryRouter>
                    <MetricStrip className="max-w-xs">
                        <Metric label="Failed" to="/traces?status=failed">
                            27
                        </Metric>
                    </MetricStrip>
                </MemoryRouter>
            ),
        },
    ],
}
