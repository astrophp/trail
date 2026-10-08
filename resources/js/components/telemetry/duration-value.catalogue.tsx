import { DurationValue } from '@/components/telemetry/duration-value'
import type { Status } from '@/api/types'
import type { CatalogueEntry } from '@/catalogue/types'

const durations: [string, number | null, Status | undefined][] = [
    ['Under a millisecond', 0.4, 'completed'],
    ['Milliseconds', 840, 'completed'],
    ['Seconds', 9_200, 'completed'],
    ['Minutes', 65_000, 'completed'],
    ['Hours', 3_720_000, 'completed'],
    ['Running, not finished', null, 'running'],
    ['Not captured, completed', null, 'completed'],
    ['Not captured, failed', null, 'failed'],
    ['Not captured, incomplete', null, 'incomplete'],
    ['Over many runs', 1_900, undefined],
    ['Over many runs, none measured', null, undefined],
]

export const catalogue: CatalogueEntry = {
    title: 'Duration value',
    specimens: durations.map(([name, duration_ms, status]) => ({
        name,
        Component: () => <DurationValue of={{ duration_ms, status }} />,
    })),
}
