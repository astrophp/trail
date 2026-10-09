import { describe, expect, it } from 'vitest'
import type { ProjectionLeftOut, SpendProjection } from '@/api/types'
import {
    assumptionSentence,
    leftOutSentence,
    noProjectionSentence,
    spendSummary,
    spendTableCaption,
} from '@/features/usage/spend-words'
import { spendFixture } from '@/test/usage-api'

const nothingLeftOut: ProjectionLeftOut = {
    unpriced_steps: 0,
    unpriced_tokens: 0,
    unfinished_runs: 0,
}

const history = (
    window: { buckets: number; with_usage: number } | null,
): SpendProjection => ({
    state: 'not_enough_history',
    window:
        window === null
            ? null
            : {
                  from: '2026-01-02T06:00:00.000Z',
                  to: '2026-01-02T12:00:00.000Z',
                  ...window,
              },
    per_bucket: null,
    total: null,
    buckets: [],
    left_out: nothingLeftOut,
})

describe('assumptionSentence', () => {
    it('counts hours, and says what the rate is priced at and that recorded costs stay', () => {
        expect(assumptionSentence('hour', { buckets: 6, with_usage: 5 })).toBe(
            'Projected from the tokens recorded in the last 6 complete hours (5 with usage), priced at the prices saved now. Recorded costs do not change when a price changes.',
        )
    })

    it('counts 5-minute buckets, never turning them into a length of time', () => {
        expect(assumptionSentence('5m', { buckets: 6, with_usage: 4 })).toBe(
            'Projected from the tokens recorded in the last 6 complete 5-minute buckets (4 with usage), priced at the prices saved now. Recorded costs do not change when a price changes.',
        )
    })

    it('counts days', () => {
        expect(assumptionSentence('day', { buckets: 6, with_usage: 3 })).toBe(
            'Projected from the tokens recorded in the last 6 complete days (3 with usage), priced at the prices saved now. Recorded costs do not change when a price changes.',
        )
    })

    it('says a single bucket in the singular', () => {
        expect(
            assumptionSentence('day', { buckets: 1, with_usage: 1 }),
        ).toContain('in the last 1 complete day (1 with usage)')
    })
})

describe('noProjectionSentence', () => {
    it('says nothing when there is a projection', () => {
        expect(
            noProjectionSentence('hour', spendFixture.data.projection),
        ).toBeNull()
    })

    it('counts the buckets that had usage against the ones that are needed', () => {
        expect(
            noProjectionSentence(
                'hour',
                history({ buckets: 6, with_usage: 2 }),
            ),
        ).toBe(
            'Not enough recent usage to project: 2 of the last 6 complete hours have recorded usage; 3 are needed.',
        )
        expect(
            noProjectionSentence('5m', history({ buckets: 6, with_usage: 0 })),
        ).toBe(
            'Not enough recent usage to project: 0 of the last 6 complete 5-minute buckets have recorded usage; 3 are needed.',
        )
        expect(
            noProjectionSentence('day', history({ buckets: 1, with_usage: 0 })),
        ).toBe(
            'Not enough recent usage to project: 0 of the last 1 complete day have recorded usage; 3 are needed.',
        )
    })

    it('says there is no complete bucket yet when there is no window', () => {
        expect(noProjectionSentence('hour', history(null))).toBe(
            'Not enough recent usage to project: no complete hour yet.',
        )
        expect(noProjectionSentence('5m', history(null))).toBe(
            'Not enough recent usage to project: no complete 5-minute bucket yet.',
        )
        expect(noProjectionSentence('day', history(null))).toBe(
            'Not enough recent usage to project: no complete day yet.',
        )
    })

    it('says it was the prices that were missing when enough buckets had usage', () => {
        expect(
            noProjectionSentence(
                'hour',
                history({ buckets: 6, with_usage: 4 }),
            ),
        ).toBe(
            'None of the usage in the last 6 complete hours has a price, so nothing is projected.',
        )
    })

    it('says a projection is only made for a range that ends now', () => {
        expect(
            noProjectionSentence('hour', {
                state: 'range_not_current',
                window: null,
                per_bucket: null,
                total: null,
                buckets: [],
                left_out: nothingLeftOut,
            }),
        ).toBe('A projection is only made for a range that ends now.')
    })
})

describe('leftOutSentence', () => {
    const left = (patch: Partial<ProjectionLeftOut>) =>
        leftOutSentence({ ...nothingLeftOut, ...patch })

    it('says nothing when nothing was left out', () => {
        expect(left({})).toBeNull()
    })

    it('says unpriced steps with their tokens', () => {
        expect(left({ unpriced_steps: 2, unpriced_tokens: 5300 })).toBe(
            'Left out: 2 unpriced steps (5,300 tokens).',
        )
        expect(left({ unpriced_steps: 1, unpriced_tokens: 1 })).toBe(
            'Left out: 1 unpriced step (1 token).',
        )
    })

    it('leaves the tokens out of the sentence when the steps reported none', () => {
        expect(left({ unpriced_steps: 3, unpriced_tokens: null })).toBe(
            'Left out: 3 unpriced steps.',
        )
    })

    it('says the runs that are still in flight', () => {
        expect(left({ unfinished_runs: 1 })).toBe(
            'Left out: 1 run still in flight.',
        )
        expect(left({ unfinished_runs: 4 })).toBe(
            'Left out: 4 runs still in flight.',
        )
    })

    it('says both, steps first', () => {
        expect(
            left({
                unpriced_steps: 2,
                unpriced_tokens: 5300,
                unfinished_runs: 1,
            }),
        ).toBe(
            'Left out: 2 unpriced steps (5,300 tokens) and 1 run still in flight.',
        )
        expect(
            left({
                unpriced_steps: 2,
                unpriced_tokens: null,
                unfinished_runs: 3,
            }),
        ).toBe('Left out: 2 unpriced steps and 3 runs still in flight.')
    })
})

describe('the words for the chart', () => {
    it('names the unit of the buckets and the period, and says a projection is not a cost', () => {
        const summary = spendSummary(spendFixture.data, '24 hours')

        expect(summary).toContain('through each hour of the range')
        expect(summary).toContain('projection for the next 24 hours')
        expect(summary).toContain('a projection is not a cost')
        expect(summary).toContain('Cumulative estimated cost')
    })

    it('does not mention a projection when there is none', () => {
        const summary = spendSummary(
            {
                ...spendFixture.data,
                projection: history({ buckets: 6, with_usage: 0 }),
            },
            '24 hours',
        )

        expect(summary).toContain('through each hour of the range')
        expect(summary).not.toMatch(/projection/i)
    })

    it('captions the table with the unit and says the two kinds of amount are apart', () => {
        expect(spendTableCaption('5m')).toContain('each 5-minute bucket')
        expect(spendTableCaption('day')).toContain('each day')
        expect(spendTableCaption('hour')).toContain('separate columns')
    })
})
