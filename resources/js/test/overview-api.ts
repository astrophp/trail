import { vi } from 'vitest'
import type {
    AttentionResponse,
    BucketUnit,
    OverviewResponse,
    SeriesBucket,
    Summary,
} from '@/api/types'
import type { TimeRangePreset } from '@/lib/time-range'
import { contractFixture } from '@/test/contract-fixture'
import { json, metaFixture, type Handler } from '@/test/traces-api'

export {
    deferred,
    expectSearch,
    json,
    metaFixture,
    paramsOf,
    type Handler,
} from '@/test/traces-api'

/** The answer the contract test froze: 32 runs, 3 of them running, and 2 in the previous period. */
export const overviewFixture = contractFixture('overview') as OverviewResponse

/** The answer the contract test froze for the attention list: one item of every kind. */
export const attentionFixture = contractFixture(
    'attention',
) as AttentionResponse

const isAttention = (url: string) => url.includes('/api/overview/attention')

/**
 * The fixture with its summary changed by `patch` and, when given, its previous period replaced
 * and the preset it answers for.
 */
export function overviewWith(
    patch: Partial<Summary>,
    previous: Summary | null | undefined = undefined,
    preset: TimeRangePreset = '24h',
): OverviewResponse {
    return {
        ...overviewFixture,
        range: { ...overviewFixture.range, preset },
        data: {
            ...overviewFixture.data,
            summary: { ...overviewFixture.data.summary, ...patch },
            previous:
                previous === undefined
                    ? overviewFixture.data.previous
                    : previous,
        },
    }
}

/** The fixture as the range asked for would have it: the preset the request named. */
export function overviewFor(url: string): OverviewResponse {
    const preset = new URL(url, 'http://x').searchParams.get('range')

    return {
        ...overviewFixture,
        range: {
            ...overviewFixture.range,
            preset: preset as TimeRangePreset,
        },
    }
}

/** A bucket with no runs, as the API sends one, with `patch` applied. */
export function seriesBucket(
    from: string,
    to: string,
    patch: Partial<SeriesBucket> = {},
): SeriesBucket {
    return {
        from,
        to,
        full: true,
        in_progress: false,
        runs: runs({}),
        duration: { average_ms: null, measured: 0 },
        cost: { state: 'not_captured', amount: null },
        unpriced_runs: 0,
        ...patch,
    }
}

/**
 * The fixture with its series replaced, and the preset it answers for. A `patch` changes its
 * summary, as `overviewWith` does.
 */
export function overviewWithSeries(
    buckets: SeriesBucket[],
    bucket: BucketUnit = 'hour',
    preset: TimeRangePreset = '24h',
    patch: Partial<Summary> = {},
): OverviewResponse {
    const base = overviewWith(patch, undefined, preset)

    return { ...base, data: { ...base.data, series: { bucket, buckets } } }
}

/**
 * The fixture as the range asked for would have it, with nothing running: the same 32 runs, all
 * of them finished. A page that shows it asks for nothing again by itself, so a test that counts
 * or lists requests and is not about refreshing uses this one.
 */
export function quietOverviewFor(url: string): OverviewResponse {
    const answer = overviewFor(url)

    return {
        ...answer,
        data: {
            ...answer.data,
            summary: {
                ...answer.data.summary,
                runs: runs({ completed: 32 }),
            },
        },
    }
}

/** The attention fixture as the range asked for would have it. */
export function attentionFor(url: string): AttentionResponse {
    const preset = new URL(url, 'http://x').searchParams.get('range')

    return {
        ...attentionFixture,
        range: { ...attentionFixture.range, preset: preset as TimeRangePreset },
    }
}

/** The runs of a summary, all counted as the given status counts say. */
export function runs(counts: Partial<Summary['runs']>): Summary['runs'] {
    const merged = {
        completed: 0,
        failed: 0,
        incomplete: 0,
        running: 0,
        awaiting_approval: 0,
        ...counts,
    }

    return {
        ...merged,
        all:
            merged.completed +
            merged.failed +
            merged.incomplete +
            merged.running +
            merged.awaiting_approval,
    }
}

/**
 * Answers `/meta` with its fixture, `/overview` with `respond` and `/overview/attention` with
 * `attention` (by default its fixture).
 */
export function mockApi(
    respond: Handler = (url) => json(overviewFor(url)),
    meta: Handler = () => json(metaFixture),
    attention: Handler = (url) => json(attentionFor(url)),
) {
    const fetchMock = vi.fn<Handler>((url, init) =>
        url.includes('/api/meta')
            ? meta(url, init)
            : isAttention(url)
              ? attention(url, init)
              : respond(url, init),
    )
    vi.stubGlobal('fetch', fetchMock)

    return fetchMock
}

/** The overview requests made so far, not the attention list's. */
export const overviewUrls = (fetchMock: ReturnType<typeof mockApi>) =>
    fetchMock.mock.calls
        .map(([url]) => url)
        .filter((url) => url.includes('/api/overview') && !isAttention(url))

/** The attention list's requests made so far. */
export const attentionUrls = (fetchMock: ReturnType<typeof mockApi>) =>
    fetchMock.mock.calls.map(([url]) => url).filter(isAttention)
