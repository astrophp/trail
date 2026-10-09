import { useState } from 'react'
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
}: {
    loaded?: boolean
    busy?: boolean
}) {
    const [mode, setMode] = useState<ActivityMode>('volume')

    return (
        <ActivityChart
            series={loaded ? seriesFixture : undefined}
            summary={loaded ? summaryFixture : undefined}
            mode={mode}
            onModeChange={setMode}
            busy={busy}
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
    ],
}
