import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelError } from '@/components/patterns/panel-error'
import { PanelHeader } from '@/components/patterns/panel-header'
import { TimeSeriesChart } from '@/components/patterns/time-series-chart'
import {
    barSeries,
    formatBucket,
    formatTick,
    formatValue,
    hourlyBuckets,
    lineSeries,
    words,
} from '@/components/patterns/time-series-chart-fixtures'
import type { CatalogueEntry } from '@/catalogue/types'

const shared = {
    formatTick,
    formatBucket,
    formatValue,
    ...words,
}

const noValues = (count: number) => Array<null>(count).fill(null)
const zeros = (count: number) => Array<number>(count).fill(0)

function StackedBars({ count = 8 }: { count?: number }) {
    return (
        <TimeSeriesChart
            {...shared}
            buckets={hourlyBuckets(count)}
            bars={barSeries().map((one) => ({
                ...one,
                values: Array.from(
                    { length: count },
                    (_, index) => one.values[index % one.values.length] ?? null,
                ),
            }))}
            summary="Three stacked series over the last hours; the last hour is still in progress."
        />
    )
}

function Line() {
    return (
        <TimeSeriesChart
            {...shared}
            buckets={hourlyBuckets(8)}
            line={lineSeries()}
            summary="One level over the last hours, with two hours missing; the last hour is still in progress."
        />
    )
}

/** A recorded line over the first five buckets and a dashed continuation from the fifth to the eighth. */
function Projection({ withTable = false }: { withTable?: boolean }) {
    return (
        <TimeSeriesChart
            {...shared}
            buckets={hourlyBuckets(8, false)}
            line={{
                key: 'level',
                label: 'Recorded',
                color: 'chart-3',
                values: [1, 1.5, 2.5, 3, 4.2, null, null, null],
                span: { to: 4 },
            }}
            dashedLine={{
                key: 'projected',
                label: 'Projected',
                color: 'chart-4',
                values: [null, null, null, null, 4.2, 5, 5.8, 6.6],
                span: { from: 4 },
                anchor: 4,
            }}
            divider={{ at: 4, label: 'Now' }}
            shadeFrom={4}
            table={
                withTable ? (
                    <p className="text-caption">
                        A table of the caller’s own goes here.
                    </p>
                ) : undefined
            }
            summary="A recorded line over five hours, continued by a dashed projection over the next three."
        />
    )
}

function States() {
    const buckets = hourlyBuckets(6)

    return (
        <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
            <Panel>
                <PanelHeader title="With data" headingLevel={3} />
                <PanelContent>
                    <TimeSeriesChart
                        {...shared}
                        buckets={buckets}
                        bars={barSeries().map((one) => ({
                            ...one,
                            values: one.values.slice(0, 6),
                        }))}
                        summary="Three stacked series over six hours."
                    />
                </PanelContent>
            </Panel>
            <Panel>
                <PanelHeader title="No data" headingLevel={3} />
                <PanelContent>
                    <TimeSeriesChart
                        {...shared}
                        buckets={buckets}
                        bars={[
                            {
                                key: 'alpha',
                                label: 'Alpha',
                                color: 'chart-1',
                                values: noValues(6),
                            },
                        ]}
                        summary="Nothing was recorded in these six hours."
                    />
                </PanelContent>
            </Panel>
            <Panel>
                <PanelHeader title="All zero" headingLevel={3} />
                <PanelContent>
                    <TimeSeriesChart
                        {...shared}
                        buckets={hourlyBuckets(6, false)}
                        bars={[
                            {
                                key: 'alpha',
                                label: 'Alpha',
                                color: 'chart-1',
                                values: zeros(6),
                            },
                        ]}
                        summary="Every one of six hours is 0."
                    />
                </PanelContent>
            </Panel>
            <Panel>
                <PanelHeader title="Failed to load" headingLevel={3} />
                <PanelContent>
                    <PanelError
                        message="The server could not be reached."
                        onRetry={() => {}}
                    />
                </PanelContent>
            </Panel>
        </div>
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Time series chart',
    specimens: [
        {
            name: 'Stacked bars, last bucket in progress',
            Component: StackedBars,
        },
        {
            name: 'Line with missing buckets, last in progress',
            Component: Line,
        },
        {
            name: 'Recorded line, dashed projection, divider and shaded region',
            Component: Projection,
        },
        {
            name: 'The same with a table of the caller’s own behind the data button',
            Component: () => <Projection withTable />,
        },
        {
            name: 'One bucket, bars',
            Component: () => (
                <TimeSeriesChart
                    {...shared}
                    buckets={hourlyBuckets(1, false)}
                    bars={barSeries().map((one) => ({
                        ...one,
                        values: one.values.slice(0, 1),
                    }))}
                    summary="One hour with three stacked series."
                />
            ),
        },
        {
            name: 'One bucket, line',
            Component: () => (
                <TimeSeriesChart
                    {...shared}
                    buckets={hourlyBuckets(1, false)}
                    line={{ ...lineSeries(), values: [3.1] }}
                    summary="One hour with a level of 3.1."
                />
            ),
        },
        {
            name: 'Narrow: fewer labels',
            Component: () => (
                <div className="max-w-72">
                    <StackedBars count={24} />
                </div>
            ),
        },
        {
            name: 'Narrow: long y labels',
            Component: () => (
                <div className="max-w-72">
                    <TimeSeriesChart
                        {...shared}
                        formatValue={(value) =>
                            `$1,${String(value).padStart(3, '0')}.00`
                        }
                        buckets={hourlyBuckets(24)}
                        bars={[
                            {
                                key: 'alpha',
                                label: 'Alpha',
                                color: 'chart-1',
                                values: Array.from(
                                    { length: 24 },
                                    (_, index) => (index * 7) % 23,
                                ),
                            },
                        ]}
                        summary="One invented series over 24 hours."
                    />
                </div>
            ),
        },
        {
            name: 'Wide: 24 buckets',
            Component: () => <StackedBars count={24} />,
        },
        { name: 'The four states', Component: States },
    ],
}
