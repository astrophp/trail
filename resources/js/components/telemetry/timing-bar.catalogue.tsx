import { TimingBar } from '@/components/telemetry/timing-bar'
import type { Span } from '@/api/types'
import type { CatalogueEntry } from '@/catalogue/types'

type Timing = Pick<Span, 'offset_ms' | 'duration_ms' | 'status'>

const bars: [string, Timing, number | null][] = [
    [
        'Completed',
        { offset_ms: 200, duration_ms: 400, status: 'completed' },
        1000,
    ],
    [
        'Zero offset',
        { offset_ms: 0, duration_ms: 300, status: 'completed' },
        1000,
    ],
    [
        'Tiny duration',
        { offset_ms: 500, duration_ms: 0.05, status: 'completed' },
        10_000,
    ],
    [
        'Negative offset (drawn from the start)',
        { offset_ms: -50, duration_ms: 200, status: 'completed' },
        1000,
    ],
    [
        'Overflowing (clamped to the edge)',
        { offset_ms: 800, duration_ms: 600, status: 'completed' },
        1000,
    ],
    ['Failed', { offset_ms: 200, duration_ms: 400, status: 'failed' }, 1000],
    [
        'Incomplete',
        { offset_ms: 200, duration_ms: 400, status: 'incomplete' },
        1000,
    ],
    [
        'Awaiting approval',
        { offset_ms: 200, duration_ms: 400, status: 'awaiting_approval' },
        1000,
    ],
    ['Running', { offset_ms: 400, duration_ms: null, status: 'running' }, 1000],
    [
        'Running, no axis',
        { offset_ms: 400, duration_ms: null, status: 'running' },
        null,
    ],
    [
        'Duration not captured',
        { offset_ms: 200, duration_ms: null, status: 'completed' },
        1000,
    ],
    [
        'Duration captured, no axis',
        { offset_ms: 200, duration_ms: 400, status: 'completed' },
        null,
    ],
    [
        'Starts beyond the axis',
        { offset_ms: 5_000, duration_ms: 100, status: 'completed' },
        1000,
    ],
]

export const catalogue: CatalogueEntry = {
    title: 'Timing bar',
    specimens: bars.map(([name, span, axisMs]) => ({
        name,
        Component: () => (
            <div className="w-72">
                <TimingBar span={span} axisMs={axisMs} />
            </div>
        ),
    })),
}
