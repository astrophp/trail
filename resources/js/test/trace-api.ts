import type {
    AgentSubtotal,
    PendingApproval,
    Coverage,
    Span,
    Trace,
    TraceDetailResponse,
} from '@/api/types'
import { contractFixture } from '@/test/contract-fixture'
import { json, mockApi, type Handler } from '@/test/traces-api'

/** The trace endpoint as the PHP contract test froze it: a failed run with eleven spans. */
export const detailFixture = contractFixture('trace') as TraceDetailResponse

const fixtureSpan = detailFixture.data.spans[1]
const fixtureAgent = detailFixture.data.spans[0]

const notReported = {
    state: 'not_reported',
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    reasoning_tokens: null,
    total_tokens: null,
} as const

/**
 * A span with the fixture's completed model step as its base, with the given fields replaced.
 * Payloads are left empty: nothing here reads them.
 */
export function makeSpan(
    id: string,
    overrides: Partial<Span> & Pick<Span, 'sequence'>,
): Span {
    return {
        ...fixtureSpan,
        id,
        parent_id: null,
        input: null,
        output: null,
        metadata: null,
        truncated_paths: {},
        redacted: false,
        truncated: false,
        ...overrides,
    }
}

/** An agent span: it does not bill itself, so its usage and cost are `null`. */
export function makeAgentSpan(
    id: string,
    overrides: Partial<Span> & Pick<Span, 'sequence'>,
): Span {
    return makeSpan(id, {
        type: 'agent',
        name: 'SupportAssistant',
        agent_class: fixtureAgent.agent_class,
        step_number: null,
        usage: null,
        cost: null,
        responding_model: null,
        ...overrides,
    })
}

/** A tool span: it does not bill either. */
export function makeToolSpan(
    id: string,
    overrides: Partial<Span> & Pick<Span, 'sequence'>,
): Span {
    return makeSpan(id, {
        type: 'tool',
        name: 'search',
        step_number: null,
        provider: null,
        model: null,
        responding_model: null,
        usage: null,
        cost: null,
        ...overrides,
    })
}

/** A model step. `step_number` is given in the overrides, from 0. */
export function makeStepSpan(
    id: string,
    overrides: Partial<Span> & Pick<Span, 'sequence'>,
): Span {
    return makeSpan(id, { type: 'step', name: 'step', ...overrides })
}

/** An embeddings call. */
export function makeEmbeddingSpan(
    id: string,
    overrides: Partial<Span> & Pick<Span, 'sequence'>,
): Span {
    return makeSpan(id, {
        type: 'embedding',
        name: 'embeddings',
        step_number: null,
        provider: 'openai',
        model: 'text-embedding-3-small',
        ...overrides,
    })
}

type DetailOptions = {
    trace?: Partial<Trace>
    spans: Span[]
    /** The server's subtotals; by default one per agent span, with nothing reported. */
    agents?: AgentSubtotal[]
    error?: TraceDetailResponse['data']['detail']['error']
    /** The tool calls the run waits on; none by default. */
    pendingApprovals?: PendingApproval[]
    /** Parts of the run's coverage to replace; the fixture's otherwise. */
    coverage?: Partial<Coverage>
}

/** A trace response for the given spans, on the fixture's run with the given fields replaced. */
export function makeDetail({
    trace,
    spans,
    agents,
    error = null,
    pendingApprovals = [],
    coverage,
}: DetailOptions): TraceDetailResponse {
    const base = detailFixture.data

    return {
        ...detailFixture,
        data: {
            ...base,
            trace: {
                ...base.trace,
                span_count: spans.length,
                ...trace,
            },
            detail: {
                ...base.detail,
                error,
                pending_approvals: pendingApprovals,
            },
            spans,
            coverage: { ...base.coverage, ...coverage },
            usage: {
                ...base.usage,
                agents:
                    agents ??
                    spans
                        .filter((span) => span.type === 'agent')
                        .map((span) => ({
                            span_id: span.id,
                            name: span.name,
                            usage: notReported,
                            cost: { state: 'not_captured', amount: null },
                        })),
            },
        },
        span_limit: { limit: 2000, total: spans.length, truncated: false },
    }
}

/**
 * Answers `GET /traces/{id}` with `details[id]` (a response, or a handler that returns one) and
 * `404` for any other run; `/meta` and the bookmark endpoints are answered as `mockApi` does.
 */
export function mockTraceApi(
    details: Record<string, TraceDetailResponse | Handler>,
    bookmark?: Handler,
) {
    return mockApi((url, init) => {
        const id = decodeURIComponent(
            new URL(url, 'http://x').pathname.split('/').at(-1) ?? '',
        )
        const detail = details[id]

        if (detail === undefined) {
            return json({ message: 'No run with this id.' }, 404)
        }

        return typeof detail === 'function' ? detail(url, init) : json(detail)
    }, bookmark)
}

/** The detail requests made so far, as paths. */
export const detailUrls = (fetchMock: ReturnType<typeof mockApi>) =>
    fetchMock.mock.calls
        .map(([url]) => url)
        .filter((url) => /\/api\/traces\/[^/?]+$/.test(url))
