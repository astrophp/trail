// Invented data for the catalogue of the components that draw a summary, a series and what needs
// attention.
import type { AttentionItem, Series, Summary } from '@/api/types'

const usage = {
    state: 'reported',
    input_tokens: 41_000,
    output_tokens: 8_200,
    cache_read_tokens: null,
    cache_write_tokens: null,
    reasoning_tokens: null,
    total_tokens: 49_200,
} as const

/** A summary of 52 runs that all finished, with a percentile. */
export const summaryFixture: Summary = {
    runs: {
        all: 52,
        completed: 43,
        failed: 7,
        incomplete: 2,
        running: 0,
        awaiting_approval: 0,
    },
    error_rate: { rate: 7 / 52, failed: 7, finished: 52 },
    duration: {
        average_ms: 1840,
        p95_ms: 9200,
        measured: 52,
        not_measured: 0,
        p95_minimum: 20,
    },
    usage,
    usage_coverage: { reported: 52, not_reported: 0 },
    cost: { state: 'estimated', amount: 11.48 },
    cost_coverage: { unpriced_runs: 3, runs_without_amount: 0 },
}

/** The period before it. */
export const previousFixture: Summary = {
    ...summaryFixture,
    runs: {
        ...summaryFixture.runs,
        all: 40,
        completed: 36,
        failed: 3,
        incomplete: 1,
    },
    error_rate: { rate: 3 / 40, failed: 3, finished: 40 },
    duration: { ...summaryFixture.duration, average_ms: 1500, p95_ms: 7800 },
    cost: { state: 'estimated', amount: 9.1 },
}

const hour = 3_600_000
const start = Date.UTC(2026, 0, 5, 6)

/** Eight hourly buckets with a few runs in each. */
export const seriesFixture: Series = {
    bucket: 'hour',
    buckets: Array.from({ length: 8 }, (_, index) => ({
        from: new Date(start + index * hour).toISOString(),
        to: new Date(start + (index + 1) * hour).toISOString(),
        full: true,
        in_progress: false,
        runs: {
            all: 6 + index,
            completed: 5 + index,
            failed: index % 3 === 0 ? 1 : 0,
            incomplete: 0,
            running: 0,
            awaiting_approval: 0,
        },
        duration: { average_ms: 1200 + index * 100, measured: 6 + index },
        cost: { state: 'estimated', amount: 0.4 + index * 0.05 },
        unpriced_runs: 0,
    })),
}

/** A failed item with its issue kinds, and one without. */
export const attentionFixture: AttentionItem[] = [
    {
        kind: 'failed',
        count: 7,
        latest_at: '2026-01-05T11:30:00.000Z',
        filters: { status: 'failed' },
        breakdown: [
            {
                issue_kind: 'rate_limited',
                count: 5,
                latest_at: '2026-01-05T11:30:00.000Z',
                filters: { status: 'failed', issue_kind: 'rate_limited' },
            },
            {
                issue_kind: 'tool_error',
                count: 2,
                latest_at: '2026-01-05T10:10:00.000Z',
                filters: { status: 'failed', issue_kind: 'tool_error' },
            },
        ],
    },
    {
        kind: 'unpriced',
        count: 3,
        latest_at: '2026-01-05T09:00:00.000Z',
        filters: { unpriced: '1' },
        breakdown: [],
    },
]
