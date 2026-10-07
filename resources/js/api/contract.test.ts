import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type {
    BookmarkResponse,
    Cost,
    CostState,
    IssueKind,
    Meta,
    MetaResponse,
    Pagination,
    Range,
    Status,
    StatusCounts,
    Trace,
    TraceListResponse,
    Usage,
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

// The values of the unions in types.ts, in the order PHP declares them. The type
// checks below tie each list to its union; the fixture check ties it to PHP.
expectTypeOf<(typeof statuses)[number]>().toEqualTypeOf<Status>()
expectTypeOf<(typeof issueKinds)[number]>().toEqualTypeOf<IssueKind>()

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
            NonNullable<z.infer<typeof trace>['issue_kind']>
        >().toEqualTypeOf<IssueKind>()
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

describe('tests/Contract/enums.json', () => {
    it('lists the members of the status and issue kind types', () => {
        expect(contractFixture('enums')).toEqual({
            status: statuses,
            issue_kind: issueKinds,
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
