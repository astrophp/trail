import {
    barSeries,
    formatBucket,
    formatTick,
    formatValue,
    hourlyBuckets,
} from '@/components/patterns/time-series-chart-fixtures'
import { buildChartModel } from '@/components/patterns/time-series-chart-model'
import { TimeSeriesChartTable } from '@/components/patterns/time-series-chart-table'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Time series chart table',
    specimens: [
        {
            name: 'A row per bucket, a column per series',
            Component: () => (
                <TimeSeriesChartTable
                    model={buildChartModel({
                        buckets: hourlyBuckets(8),
                        series: barSeries(),
                        stacked: true,
                        formatBucket,
                        formatTick,
                    })}
                    caption="Three stacked series over eight hours."
                    missingLabel="Not captured"
                    inProgressLabel="In progress"
                    formatValue={formatValue}
                />
            ),
        },
    ],
}
