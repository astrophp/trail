import {
    barSeries,
    formatBucket,
    formatTick,
    formatValue,
    hourlyBuckets,
} from '@/components/patterns/time-series-chart-fixtures'
import { buildChartModel } from '@/components/patterns/time-series-chart-model'
import { TimeSeriesChartTooltip } from '@/components/patterns/time-series-chart-tooltip'
import type { CatalogueEntry } from '@/catalogue/types'

const model = buildChartModel({
    buckets: hourlyBuckets(8),
    series: barSeries(),
    stacked: true,
    formatBucket,
    formatTick,
})

function Tooltip({ bucketIndex }: { bucketIndex: number }) {
    return (
        <TimeSeriesChartTooltip
            model={model}
            bucketIndex={bucketIndex}
            missingLabel="Not captured"
            inProgressLabel="In progress"
            formatValue={formatValue}
            className="w-56"
        />
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Time series chart tooltip',
    specimens: [
        {
            name: 'A complete bucket',
            Component: () => <Tooltip bucketIndex={3} />,
        },
        {
            name: 'A bucket with a value not captured',
            Component: () => <Tooltip bucketIndex={5} />,
        },
        {
            name: 'A bucket in progress',
            Component: () => <Tooltip bucketIndex={7} />,
        },
    ],
}
