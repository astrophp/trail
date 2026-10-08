import { vi } from 'vitest'
import type { OverviewResponse, Summary } from '@/api/types'
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

/** Answers `/meta` with its fixture and `/overview` with `respond`. */
export function mockApi(
    respond: Handler = (url) => json(overviewFor(url)),
    meta: Handler = () => json(metaFixture),
) {
    const fetchMock = vi.fn<Handler>((url, init) =>
        url.includes('/api/meta') ? meta(url, init) : respond(url, init),
    )
    vi.stubGlobal('fetch', fetchMock)

    return fetchMock
}

/** The overview requests made so far. */
export const overviewUrls = (fetchMock: ReturnType<typeof mockApi>) =>
    fetchMock.mock.calls
        .map(([url]) => url)
        .filter((url) => url.includes('/api/overview'))
