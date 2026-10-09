import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TimeSeriesChart } from '@/components/patterns/time-series-chart'
import {
    formatBucket,
    formatTick,
    formatValue,
    hourlyBuckets,
    words,
} from '@/components/patterns/time-series-chart-fixtures'
import { framesInFlight, settleFrames } from '@/test/frame-guard'

describe('a rendered chart', () => {
    it('leaves a frame in flight, which the guard waits for before the file ends', async () => {
        // The frame is the cause of the teardown race: Recharts' store batches its updates with a
        // frame and a timer that race, and the timer calls `cancelAnimationFrame`.
        await settleFrames()

        render(
            <TimeSeriesChart
                {...words}
                buckets={hourlyBuckets(3, false)}
                line={{
                    key: 'level',
                    label: 'Level',
                    color: 'chart-2',
                    values: [1, 2, 3],
                }}
                formatBucket={formatBucket}
                formatTick={formatTick}
                formatValue={formatValue}
                summary="Three invented hours."
            />,
        )

        expect(framesInFlight()).toBeGreaterThan(0)

        await settleFrames()

        expect(framesInFlight()).toBe(0)
    })
})
