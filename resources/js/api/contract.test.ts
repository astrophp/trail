import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type {
    AgentSubtotal,
    BookmarkResponse,
    Cost,
    CostState,
    Coverage,
    CoverageItem,
    CoverageReason,
    CoverageState,
    ErrorSource,
    IssueKind,
    JsonObject,
    JsonValue,
    Meta,
    MetaResponse,
    Pagination,
    PendingApproval,
    Range,
    Span,
    SpanCost,
    SpanLimit,
    SpanType,
    Status,
    StatusCounts,
    Trace,
    TraceDetail,
    TraceDetailResponse,
    TraceError,
    TraceListResponse,
    TraceNeighbours,
    TraceNeighboursResponse,
    TraceUsageBreakdown,
    Usage,
    UsageRow,
    UsageState,
    User,
} from '@/api/types'
import { contractFixture } from '@/test/contract-fixture'

// The PHP side writes tests/Contract/*.json from the real resources (see
// tests/Feature/Http/Api/ContractTest.php). Here those files are parsed with
// schemas that refuse missing and unknown keys, and each schema must be the same
// type as its counterpart in api/types.ts, so a rename on either side fails
// either this test or `npm run typecheck`.

const statuses = [
    'running',
    'completed',
    'failed',
    'incomplete',
    'awaiting_approval',
] as const
const issueKinds = [
    'rate_limited',
    'provider_overloaded',
    'provider_connection',
    'insufficient_credits',
    'tool_error',
    'exception',
    'abandoned',
] as const

const spanTypes = ['agent', 'step', 'tool', 'embedding'] as const
const errorSources = ['step', 'tool', 'run'] as const

// The values of the unions in types.ts, in the order PHP declares them. The type
// checks below tie each list to its union; the fixture check ties it to PHP.
expectTypeOf<(typeof statuses)[number]>().toEqualTypeOf<Status>()
expectTypeOf<(typeof issueKinds)[number]>().toEqualTypeOf<IssueKind>()
expectTypeOf<(typeof spanTypes)[number]>().toEqualTypeOf<SpanType>()
expectTypeOf<(typeof errorSources)[number]>().toEqualTypeOf<ErrorSource>()

const nullable = <T extends z.ZodType>(schema: T) => schema.nullable()
const count = z.number().int()
const timestamp = z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)

const status = z.enum(statuses)

const cost = z.union([
    z.strictObject({
        state: z.enum(['estimated', 'partial']),
        amount: z.number(),
    }),
    z.strictObject({
        state: z.enum(['unpriced', 'not_captured']),
        amount: z.null(),
    }),
    z.strictObject({
        state: z.literal('pending'),
        amount: nullable(z.number()),
    }),
])

const usage = z.strictObject({
    state: z.enum(['reported', 'pending', 'not_reported']),
    input_tokens: nullable(count),
    output_tokens: nullable(count),
    cache_read_tokens: nullable(count),
    cache_write_tokens: nullable(count),
    reasoning_tokens: nullable(count),
    total_tokens: nullable(count),
})

const user = z.strictObject({
    id: z.string(),
    type: z.string(),
    name: nullable(z.string()),
    email: nullable(z.string()),
})

const trace = z.strictObject({
    id: z.string(),
    type: z.enum(['agent', 'embedding']),
    name: z.string(),
    agent_class: nullable(z.string()),
    status,
    issue_kind: nullable(z.enum(issueKinds)),
    streamed: z.boolean(),
    recovered: z.boolean(),
    child_failed: z.boolean(),
    provider: nullable(z.string()),
    model: nullable(z.string()),
    duration_ms: nullable(z.number()),
    usage,
    cost,
    span_count: count,
    prompt_excerpt: nullable(z.string()),
    response_excerpt: nullable(z.string()),
    conversation_id: nullable(z.string()),
    user: nullable(user),
    bookmarked: z.boolean(),
    started_at: timestamp,
    ended_at: nullable(timestamp),
})

const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
    z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.null(),
        z.array(jsonValue),
        z.record(z.string(), jsonValue),
    ]),
)

// A span is priced whole, so its cost is never partial.
const spanCost = z.union([
    z.strictObject({ state: z.literal('estimated'), amount: z.number() }),
    z.strictObject({
        state: z.enum(['unpriced', 'not_captured']),
        amount: z.null(),
    }),
    z.strictObject({
        state: z.literal('pending'),
        amount: nullable(z.number()),
    }),
])

const traceError = z.strictObject({
    class: nullable(z.string()),
    message: nullable(z.string()),
    source: nullable(z.enum(errorSources)),
    http_status: nullable(count),
})

const span = z.strictObject({
    id: z.string(),
    parent_id: nullable(z.string()),
    type: z.enum(spanTypes),
    name: z.string(),
    agent_class: nullable(z.string()),
    status,
    issue_kind: nullable(z.enum(issueKinds)),
    attempt: count,
    sequence: count,
    step_number: nullable(count),
    provider: nullable(z.string()),
    model: nullable(z.string()),
    responding_model: nullable(z.string()),
    duration_ms: nullable(z.number()),
    offset_ms: z.number(),
    started_at: timestamp,
    ended_at: nullable(timestamp),
    usage: nullable(usage),
    cost: nullable(spanCost),
    error: nullable(traceError),
    input: jsonValue,
    output: jsonValue,
    metadata: nullable(z.record(z.string(), jsonValue)),
    redacted: z.boolean(),
    truncated: z.boolean(),
    truncated_paths: z.record(z.string(), count),
})

const pendingApproval = z.strictObject({
    tool_call_id: z.string(),
    tool: z.string(),
    arguments: jsonValue,
    reason: nullable(z.string()),
})

const traceDetail = z.strictObject({
    error: nullable(traceError),
    pending_approvals: z.array(pendingApproval),
    resolved_tool_call_ids: z.array(z.string()),
})

const usageRow = z.strictObject({
    span_id: z.string(),
    agent_span_id: nullable(z.string()),
    type: z.enum(['step', 'embedding']),
    name: z.string(),
    attempt: count,
    step_number: nullable(count),
    provider: nullable(z.string()),
    model: nullable(z.string()),
    usage,
    cost: spanCost,
})

const agentSubtotal = z.strictObject({
    span_id: z.string(),
    name: z.string(),
    usage,
    cost,
})

const traceUsageBreakdown = z.strictObject({
    totals: z.strictObject({ usage, cost }),
    rows: z.array(usageRow),
    agents: z.array(agentSubtotal),
})

const coverageStates = [
    'captured',
    'partial',
    'not_captured',
    'not_applicable',
] as const
const coverageReasons = [
    'unfinished',
    'not_reported',
    'streamed',
    'no_price',
    'not_stored',
] as const

const coverageItem = z.strictObject({
    state: z.enum(coverageStates),
    captured: count,
    expected: count,
    reason: nullable(z.enum(coverageReasons)),
})

const coverage = z.strictObject({
    timing: coverageItem,
    responding_model: coverageItem,
    usage: coverageItem,
    cost: coverageItem,
    system_prompt: coverageItem,
    payloads: coverageItem,
})

const spanLimit = z.strictObject({
    limit: count,
    total: count,
    truncated: z.boolean(),
})

const traceDetailResponse = z.strictObject({
    data: z.strictObject({
        trace,
        detail: traceDetail,
        spans: z.array(span),
        usage: traceUsageBreakdown,
        coverage,
    }),
    span_limit: spanLimit,
})

const range = z.strictObject({
    preset: nullable(z.enum(['1h', '24h', '7d'])),
    from: timestamp,
    to: timestamp,
})

const pagination = z.strictObject({
    page: count,
    per_page: count,
    total: count,
    last_page: count,
})

const statusCounts = z.strictObject({
    all: count,
    completed: count,
    failed: count,
    incomplete: count,
    running: count,
    awaiting_approval: count,
})

const meta = z.strictObject({
    app: z.strictObject({
        name: z.string(),
        environment: z.string(),
        timezone: z.string(),
    }),
    version: nullable(z.string()),
    recording: nullable(z.enum(['enabled', 'paused', 'disabled'])),
    stale_after: count,
    traces: z.strictObject({ any: z.boolean(), running: count }),
    filters: z.strictObject({
        agents: z.array(z.string()),
        providers: z.array(z.string()),
        models: z.array(
            z.strictObject({ provider: z.string(), model: z.string() }),
        ),
    }),
})

const metaResponse = z.strictObject({ data: meta, range })

const traceListResponse = z.strictObject({
    data: z.array(trace),
    pagination,
    range,
    status_counts: statusCounts,
    slow_threshold_ms: nullable(z.number()),
})

const bookmarkResponse = z.strictObject({
    data: z.strictObject({ trace_id: z.string(), bookmarked: z.boolean() }),
})

const traceNeighbours = z.strictObject({
    previous: nullable(z.string()),
    next: nullable(z.string()),
})

const traceNeighboursResponse = z.strictObject({ data: traceNeighbours })

// The schemas and the types are the same type, both ways.
describe('types', () => {
    it('match the schemas', () => {
        expectTypeOf<z.infer<typeof status>>().toEqualTypeOf<Status>()
        expectTypeOf<z.infer<typeof cost>>().toEqualTypeOf<Cost>()
        expectTypeOf<z.infer<typeof usage>>().toEqualTypeOf<Usage>()
        expectTypeOf<z.infer<typeof user>>().toEqualTypeOf<User>()
        expectTypeOf<z.infer<typeof trace>>().toEqualTypeOf<Trace>()
        expectTypeOf<z.infer<typeof range>>().toEqualTypeOf<Range>()
        expectTypeOf<z.infer<typeof pagination>>().toEqualTypeOf<Pagination>()
        expectTypeOf<
            z.infer<typeof statusCounts>
        >().toEqualTypeOf<StatusCounts>()
        expectTypeOf<z.infer<typeof meta>>().toEqualTypeOf<Meta>()
        expectTypeOf<
            z.infer<typeof metaResponse>
        >().toEqualTypeOf<MetaResponse>()
        expectTypeOf<
            z.infer<typeof traceListResponse>
        >().toEqualTypeOf<TraceListResponse>()
        expectTypeOf<
            z.infer<typeof bookmarkResponse>
        >().toEqualTypeOf<BookmarkResponse>()
        expectTypeOf<
            z.infer<typeof traceNeighbours>
        >().toEqualTypeOf<TraceNeighbours>()
        expectTypeOf<
            z.infer<typeof traceNeighboursResponse>
        >().toEqualTypeOf<TraceNeighboursResponse>()
        expectTypeOf<
            NonNullable<z.infer<typeof trace>['issue_kind']>
        >().toEqualTypeOf<IssueKind>()
    })

    it('match the schemas of the run page', () => {
        expectTypeOf<z.infer<typeof jsonValue>>().toEqualTypeOf<JsonValue>()
        expectTypeOf<
            z.infer<typeof span>['metadata']
        >().toEqualTypeOf<JsonObject | null>()
        expectTypeOf<z.infer<typeof spanCost>>().toEqualTypeOf<SpanCost>()
        expectTypeOf<z.infer<typeof traceError>>().toEqualTypeOf<TraceError>()
        expectTypeOf<z.infer<typeof span>>().toEqualTypeOf<Span>()
        expectTypeOf<
            z.infer<typeof pendingApproval>
        >().toEqualTypeOf<PendingApproval>()
        expectTypeOf<z.infer<typeof traceDetail>>().toEqualTypeOf<TraceDetail>()
        expectTypeOf<z.infer<typeof usageRow>>().toEqualTypeOf<UsageRow>()
        expectTypeOf<
            z.infer<typeof agentSubtotal>
        >().toEqualTypeOf<AgentSubtotal>()
        expectTypeOf<
            z.infer<typeof traceUsageBreakdown>
        >().toEqualTypeOf<TraceUsageBreakdown>()
        expectTypeOf<
            z.infer<typeof coverageItem>
        >().toEqualTypeOf<CoverageItem>()
        expectTypeOf<z.infer<typeof coverage>>().toEqualTypeOf<Coverage>()
        expectTypeOf<z.infer<typeof spanLimit>>().toEqualTypeOf<SpanLimit>()
        expectTypeOf<
            z.infer<typeof traceDetailResponse>
        >().toEqualTypeOf<TraceDetailResponse>()
        expectTypeOf<
            (typeof coverageStates)[number]
        >().toEqualTypeOf<CoverageState>()
        expectTypeOf<
            (typeof coverageReasons)[number]
        >().toEqualTypeOf<CoverageReason>()
    })
})

// Naming every state here makes a state added to the types a type error until it
// is listed, and the fixture check below then insists the PHP dataset has it.
const everyCostState: Record<CostState, true> = {
    estimated: true,
    partial: true,
    unpriced: true,
    pending: true,
    not_captured: true,
}
const everyUsageState: Record<UsageState, true> = {
    reported: true,
    pending: true,
    not_reported: true,
}

describe('tests/Contract/meta.json', () => {
    it('is what the API types describe', () => {
        expect(
            metaResponse.safeParse(contractFixture('meta')).error?.issues,
        ).toBeUndefined()
    })
})

describe('tests/Contract/bookmark.json', () => {
    it('is what the API types describe', () => {
        expect(
            bookmarkResponse.safeParse(contractFixture('bookmark')).error
                ?.issues,
        ).toBeUndefined()
    })
})

describe('tests/Contract/neighbours.json', () => {
    it('is what the API types describe', () => {
        expect(
            traceNeighboursResponse.safeParse(contractFixture('neighbours'))
                .error?.issues,
        ).toBeUndefined()
    })

    it('parses a run with no neighbours', () => {
        expect(
            traceNeighboursResponse.safeParse({
                data: { previous: null, next: null },
            }).success,
        ).toBe(true)
    })

    it('has both a previous and a next run', () => {
        const { data } = traceNeighboursResponse.parse(
            contractFixture('neighbours'),
        )

        expect(data.previous).not.toBeNull()
        expect(data.next).not.toBeNull()
    })
})

describe('tests/Contract/enums.json', () => {
    it('lists the members of the status, issue kind, span type and error source types', () => {
        expect(contractFixture('enums')).toEqual({
            status: statuses,
            issue_kind: issueKinds,
            span_type: spanTypes,
            error_source: errorSources,
        })
    })
})

describe('tests/Contract/traces.json', () => {
    const parsed = traceListResponse.safeParse(contractFixture('traces'))

    it('is what the API types describe', () => {
        expect(parsed.error?.issues).toBeUndefined()
    })

    const traces = parsed.data?.data ?? []

    it.each([
        ['status', statuses, traces.map((t) => t.status)],
        [
            'cost state',
            Object.keys(everyCostState),
            traces.map((t) => t.cost.state),
        ],
        [
            'usage state',
            Object.keys(everyUsageState),
            traces.map((t) => t.usage.state),
        ],
    ])('has a run of every %s', (_kind, expected, found) => {
        expect([...new Set(found)].sort()).toEqual([...expected].sort())
    })

    it('has runs with a resolved user, an unresolved one and none', () => {
        expect(traces.some((t) => t.user?.name)).toBe(true)
        expect(traces.some((t) => t.user && t.user.name === null)).toBe(true)
        expect(traces.some((t) => t.user === null)).toBe(true)
    })

    it('has a bookmarked run and an embedding', () => {
        expect(traces.some((t) => t.bookmarked)).toBe(true)
        expect(traces.some((t) => t.type === 'embedding')).toBe(true)
    })
})

describe('tests/Contract/trace.json', () => {
    const parsed = traceDetailResponse.safeParse(contractFixture('trace'))

    it('is what the API types describe', () => {
        expect(parsed.error?.issues).toBeUndefined()
    })

    const data = parsed.data?.data
    const spans = data?.spans ?? []
    const everySpanCostState: Record<SpanCost['state'], true> = {
        estimated: true,
        unpriced: true,
        pending: true,
        not_captured: true,
    }

    it('has a span of every type', () => {
        expect([...new Set(spans.map((s) => s.type))].sort()).toEqual(
            [...spanTypes].sort(),
        )
    })

    it('has a span in every cost state a span can have, and none partial', () => {
        expect(
            [
                ...new Set(
                    spans.flatMap((s) => (s.cost ? [s.cost.state] : [])),
                ),
            ].sort(),
        ).toEqual(Object.keys(everySpanCostState).sort())
    })

    it('has a span in every usage state, and no usage on agents and tools', () => {
        expect(
            [
                ...new Set(
                    spans.flatMap((s) => (s.usage ? [s.usage.state] : [])),
                ),
            ].sort(),
        ).toEqual(Object.keys(everyUsageState).sort())
        expect(
            spans
                .filter((s) => s.type === 'agent' || s.type === 'tool')
                .every((s) => s.usage === null && s.cost === null),
        ).toBe(true)
    })

    it('has coverage in the states a run with gaps can have', () => {
        // not_applicable needs an item with nothing expected, which this run
        // has none of; it is in the schema and the PHP tests cover it.
        const found = Object.values(data?.coverage ?? {}).map((c) => c.state)

        expect(new Set(found)).toEqual(
            new Set<CoverageState>(['captured', 'partial', 'not_captured']),
        )
        expect(
            Object.values(data?.coverage ?? {}).every(
                (c) => (c.reason === null) === (c.captured === c.expected),
            ),
        ).toBe(true)
    })

    it('has a failed span with an error, and an error on the run', () => {
        expect(spans.some((s) => s.status === 'failed' && s.error)).toBe(true)
        expect(data?.detail.error).not.toBeNull()
        expect(data?.detail.pending_approvals).toHaveLength(1)
    })

    it('has a sub-agent under a tool and a step without a responding model', () => {
        const byId = new Map(spans.map((s) => [s.id, s]))

        expect(
            spans.some(
                (s) =>
                    s.type === 'agent' &&
                    s.parent_id !== null &&
                    byId.get(s.parent_id)?.type === 'tool',
            ),
        ).toBe(true)
        expect(
            spans.some(
                (s) =>
                    s.type === 'step' &&
                    s.status === 'completed' &&
                    s.responding_model === null,
            ),
        ).toBe(true)
    })

    it('has a span with cut paths and redaction, and one with none', () => {
        expect(
            spans.some(
                (s) =>
                    s.redacted &&
                    s.truncated &&
                    Object.keys(s.truncated_paths).length > 0,
            ),
        ).toBe(true)
        expect(
            spans.some(
                (s) =>
                    s.truncated && Object.keys(s.truncated_paths).length === 0,
            ),
        ).toBe(true)
        expect(spans.every((s) => !('truncated' in (s.metadata ?? {})))).toBe(
            true,
        )
    })

    it('adds up: the totals are the run, and the rows and subtotals describe its spans', () => {
        const usage = data?.usage

        expect(usage?.totals).toEqual({
            usage: data?.trace.usage,
            cost: data?.trace.cost,
        })
        expect(usage?.rows.map((r) => r.span_id)).toEqual(
            spans
                .filter((s) => s.type === 'step' || s.type === 'embedding')
                .map((s) => s.id),
        )
        expect(usage?.agents.map((a) => a.span_id)).toEqual(
            spans.filter((s) => s.type === 'agent').map((s) => s.id),
        )
    })
})
