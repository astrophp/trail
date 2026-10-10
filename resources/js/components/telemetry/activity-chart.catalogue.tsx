import { useState, type ReactNode } from 'react'
import { type ActivityMode } from '@/components/telemetry/activity-mode'
import { ActivityChart } from '@/components/telemetry/activity-chart'
import {
    seriesFixture,
    summaryFixture,
} from '@/components/telemetry/summary-fixtures'
import type { CatalogueEntry } from '@/catalogue/types'

function Chart({
    loaded = true,
    busy = false,
    aside,
}: {
    loaded?: boolean
    busy?: boolean
    aside?: ReactNode
}) {
    const [mode, setMode] = useState<ActivityMode>('volume')

    return (
        <ActivityChart
            series={loaded ? seriesFixture : undefined}
            summary={loaded ? summaryFixture : undefined}
            mode={mode}
            onModeChange={setMode}
            busy={busy}
            aside={aside}
        />
    )
}

export const catalogue: CatalogueEntry = {
    title: 'Activity chart',
    specimens: [
        { name: 'Three modes', Component: () => <Chart /> },
        { name: 'Loading', Component: () => <Chart loaded={false} /> },
        {
            name: 'The previous view, while the next loads',
            Component: () => <Chart busy />,
        },
        {
            name: 'With a list beside it (under it on narrow screens)',
            Component: () => (
                <Chart
                    aside={
                        <p className="text-ui text-muted-foreground">
                            Whatever the page places beside the chart.
                        </p>
                    }
                />
            ),
        },
        {
            name: 'With a list beside it, the chart loading',
            Component: () => (
                <Chart
                    loaded={false}
                    aside={
                        <p className="text-ui text-muted-foreground">
                            Whatever the page places beside the chart.
                        </p>
                    }
                />
            ),
        },
    ],
}
