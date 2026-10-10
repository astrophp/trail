import { describe, expect, it } from 'vitest'
import type { BucketUnit } from '@/api/types'
import { activitySummary } from '@/components/telemetry/activity-series'
import { overviewFixture } from '@/test/overview-api'

const summary = overviewFixture.data.summary

// 32 traces: 1 failed, 2 incomplete; 25 with a measured duration; 2 with steps that could not be priced.
const volume = (bucket: string) =>
    `32 traces started in this range, 1 failed and 2 incomplete. For each ${bucket} the chart stacks Failed, Incomplete and Completed or in flight; Completed or in flight covers completed, running and awaiting-approval traces.`
const duration = (bucket: string) =>
    `Avg duration of the traces started in each ${bucket}. 25 of the 32 traces in this range have a measured duration; where none was measured there is no value.`
const cost = (bucket: string) =>
    `Estimated cost of the traces started in each ${bucket}. 2 of the 32 traces in this range have steps that could not be priced; where there is no amount there is no value.`

describe('activitySummary', () => {
    it.each<[BucketUnit, string]>([
        ['5m', '5-minute interval'],
        ['hour', 'hour'],
        ['day', 'day'],
    ])(
        'is the same whole sentence for each view, with no article before the %s bucket',
        (unit, bucket) => {
            expect(activitySummary('volume', summary, unit)).toBe(
                volume(bucket),
            )
            expect(activitySummary('duration', summary, unit)).toBe(
                duration(bucket),
            )
            expect(activitySummary('cost', summary, unit)).toBe(cost(bucket))
        },
    )

    it('has no "a" or "an" before the name of a bucket', () => {
        for (const unit of ['5m', 'hour', 'day'] as const) {
            for (const mode of ['volume', 'duration', 'cost'] as const) {
                expect(activitySummary(mode, summary, unit)).not.toMatch(
                    /\ban? (hour|day|5-minute)/,
                )
            }
        }
    })

    it('names every series of the view it describes', () => {
        expect(activitySummary('volume', summary, 'hour')).toMatch(
            /Failed.*Incomplete.*Completed or in flight/,
        )
        expect(activitySummary('duration', summary, 'hour')).toContain(
            'Avg duration',
        )
        expect(activitySummary('cost', summary, 'hour')).toContain(
            'Estimated cost',
        )
    })

    it('counts one trace in the singular', () => {
        expect(
            activitySummary(
                'volume',
                { ...summary, runs: { ...summary.runs, all: 1 } },
                'hour',
            ),
        ).toMatch(/^1 trace started in this range/)
    })
})
