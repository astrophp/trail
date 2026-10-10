import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type {
    Agent,
    AgentBreakdownResponse,
    AgentDelegated,
    AgentListResponse,
    AgentModel,
    AgentResponse,
    AgentTool,
    AgentTopLevel,
    DelegatedModel,
    DelegatedTool,
    AgentSubtotal,
    AttentionItem,
    AttentionKind,
    AttentionResponse,
    AttentionRow,
    BookmarkResponse,
    Conversation,
    ConversationCounts,
    ConversationListResponse,
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
    OverviewResponse,
    Pagination,
    PreviousRange,
    PendingApproval,
    Price,
    PriceListResponse,
    PriceRates,
    PriceResponse,
    Range,
    Span,
    SpanCost,
    SpanLimit,
    SearchLimit,
    SearchResponse,
    SpanType,
    BucketUnit,
    ErrorRate,
    SeriesBucket,
    SpendBucket,
    SpendProjection,
    ProjectedBucket,
    ProjectionLeftOut,
    ProjectionWindow,
    Status,
    StatusCounts,
    Summary,
    SummaryDuration,
    Trace,
    TraceDetail,
    TraceDetailResponse,
    TraceError,
    TraceListResponse,
    TraceNeighbours,
    TraceNeighboursResponse,
    TraceUsageBreakdown,
    UsageBreakdownResponse,
    UsageCoverage,
    UsageResponse,
    UsageRowCoverage,
    UsageSpendResponse,
    Attempt,
    Message,
    MessagePart,
    MessageSource,
    MessagesReason,
    MessagesState,
    ToolCall,
    ToolCallAgent,
    ToolCallLink,
    ToolCallSpan,
    ToolResult,
    TranscriptResponse,
    TranscriptWindow,
    Turn,
    TurnLimit,
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

const conversation = z.strictObject({
    id: z.string(),
    turns: statusCounts,
    agents: z.array(z.string()),
    agent_count: count,
    users: z.array(user),
    user_count: count,
    usage,
    cost,
    prompt_excerpt: nullable(z.string()),
    first_activity_at: timestamp,
    last_activity_at: timestamp,
})

const conversationCounts = z.strictObject({ all: count, failed: count })

const conversationListResponse = z.strictObject({
    data: z.array(conversation),
    pagination,
    range,
    counts: conversationCounts,
})

const errorRate = z.strictObject({
    rate: nullable(z.number()),
    failed: count,
    finished: count,
})

const summary = z.strictObject({
    runs: statusCounts,
    error_rate: errorRate,
    duration: z.strictObject({
        average_ms: nullable(z.number()),
        p95_ms: nullable(z.number()),
        measured: count,
        not_measured: count,
        p95_minimum: count,
    }),
    usage,
    usage_coverage: z.strictObject({ reported: count, not_reported: count }),
    cost,
    cost_coverage: z.strictObject({
        unpriced_runs: count,
        runs_without_amount: count,
    }),
})

const bucketUnits = ['5m', 'hour', 'day'] as const

const seriesBucket = z.strictObject({
    from: timestamp,
    to: timestamp,
    full: z.boolean(),
    in_progress: z.boolean(),
    runs: statusCounts,
    duration: z.strictObject({
        average_ms: nullable(z.number()),
        measured: count,
    }),
    cost,
    unpriced_runs: count,
})

const previousRange = z.strictObject({ from: timestamp, to: timestamp })

const overviewResponse = z.strictObject({
    data: z.strictObject({
        summary,
        previous: nullable(summary),
        series: z.strictObject({
            bucket: z.enum(bucketUnits),
            buckets: z.array(seriesBucket),
        }),
    }),
    range,
    previous_range: previousRange,
})

const attentionKinds = [
    'failed',
    'incomplete',
    'awaiting_approval',
    'child_failed',
    'unpriced',
    'recovered',
] as const

const attentionFilters = z.record(z.string(), z.string())

const attentionRow = z.strictObject({
    issue_kind: z.enum(issueKinds),
    count,
    latest_at: nullable(timestamp),
    filters: attentionFilters,
})

const attentionItem = z.strictObject({
    kind: z.enum(attentionKinds),
    count,
    latest_at: nullable(timestamp),
    filters: attentionFilters,
    breakdown: z.array(attentionRow),
})

const attentionResponse = z.strictObject({
    data: z.array(attentionItem),
    range,
})

const agentTopLevel = z.strictObject({
    runs: statusCounts,
    error_rate: errorRate,
    duration: z.strictObject({
        average_ms: nullable(z.number()),
        measured: count,
        not_measured: count,
    }),
    usage,
    cost,
    cost_coverage: z.strictObject({
        unpriced_runs: count,
        runs_without_amount: count,
    }),
    last_activity_at: nullable(timestamp),
})

const agentDelegated = z.strictObject({
    all: count,
    failed: count,
    incomplete: count,
    last_activity_at: nullable(timestamp),
})

const agent = z.strictObject({
    name: z.string(),
    agent_class: nullable(z.string()),
    type: z.enum(['agent', 'embedding']),
    top_level: nullable(agentTopLevel),
    delegated: nullable(agentDelegated),
    last_activity_at: nullable(timestamp),
    activity: z.array(count),
})

const agentListResponse = z.strictObject({
    data: z.array(agent),
    pagination,
    range,
    buckets: z.strictObject({
        bucket: z.enum(bucketUnits),
        edges: z.array(
            z.strictObject({
                from: timestamp,
                to: timestamp,
                full: z.boolean(),
                in_progress: z.boolean(),
            }),
        ),
    }),
    agent_limit: z.strictObject({ limit: count, truncated: z.boolean() }),
})

const searchLimit = z.strictObject({ limit: count, truncated: z.boolean() })

const searchResponse = z.strictObject({
    data: z.strictObject({
        traces: z.array(trace),
        conversations: z.array(conversation),
        agents: z.array(agent),
    }),
    query: z.strictObject({
        q: z.string(),
        minimum: count,
        searched: z.boolean(),
    }),
    limits: z.strictObject({
        traces: searchLimit,
        conversations: searchLimit,
        agents: searchLimit,
    }),
    range,
})

const agentResponse = z.strictObject({
    data: z.strictObject({
        agent,
        summary,
        previous: nullable(summary),
        series: z.strictObject({
            bucket: z.enum(bucketUnits),
            buckets: z.array(seriesBucket),
        }),
        attention: z.array(attentionItem),
    }),
    range,
    previous_range: previousRange,
})

const delegatedModel = z.strictObject({
    provider: z.string(),
    model: z.string(),
    steps: count,
    runs: count,
    usage,
    cost,
})

const agentModel = delegatedModel.extend({
    filters: z.record(z.string(), z.string()),
})

const delegatedTool = z.strictObject({
    name: z.string(),
    calls: count,
    failed: count,
    runs: count,
})

const agentTool = delegatedTool.extend({
    filters: z.record(z.string(), z.string()),
})

const breakdownLimit = z.strictObject({ limit: count, total: count })

const agentBreakdownResponse = z.strictObject({
    data: z.strictObject({
        models: z.array(agentModel),
        tools: z.array(agentTool),
        delegated: z.strictObject({
            models: z.array(delegatedModel),
            tools: z.array(delegatedTool),
        }),
    }),
    range,
    limits: z.strictObject({
        models: breakdownLimit,
        tools: breakdownLimit,
        delegated: z.strictObject({
            models: breakdownLimit,
            tools: breakdownLimit,
        }),
    }),
})

const usageRowCoverage = z.strictObject({
    reported_steps: count,
    unpriced_steps: count,
    unpriced_tokens: nullable(count),
})

const usageCoverage = z.strictObject({
    steps: count,
    reported_steps: count,
    unpriced_steps: count,
    unpriced_tokens: nullable(count),
})

const usageResponse = z.strictObject({
    data: z.strictObject({ summary, coverage: usageCoverage }),
    range,
})

const spendBucket = z.strictObject({
    ...seriesBucket.shape,
    cumulative: cost,
})

const projectionWindow = z.strictObject({
    from: timestamp,
    to: timestamp,
    buckets: count,
    with_usage: count,
})

const projectedBucket = z.strictObject({
    from: timestamp,
    to: timestamp,
    amount: z.number(),
    cumulative: z.number(),
})

const projectionLeftOut = z.strictObject({
    unpriced_steps: count,
    unpriced_tokens: nullable(count),
    unfinished_runs: count,
})

const spendProjection = z.discriminatedUnion('state', [
    z.strictObject({
        state: z.literal('projected'),
        window: projectionWindow,
        per_bucket: z.number(),
        total: z.number(),
        buckets: z.array(projectedBucket),
        left_out: projectionLeftOut,
    }),
    z.strictObject({
        state: z.literal('not_enough_history'),
        window: nullable(projectionWindow),
        per_bucket: z.null(),
        total: z.null(),
        buckets: z.tuple([]),
        left_out: projectionLeftOut,
    }),
    z.strictObject({
        state: z.literal('range_not_current'),
        window: z.null(),
        per_bucket: z.null(),
        total: z.null(),
        buckets: z.tuple([]),
        left_out: projectionLeftOut,
    }),
])

const usageSpendResponse = z.strictObject({
    data: z.strictObject({
        series: z.strictObject({
            bucket: z.enum(bucketUnits),
            buckets: z.array(spendBucket),
        }),
        projection: spendProjection,
    }),
    range,
})

const usageRowFigures = {
    steps: count,
    runs: count,
    usage,
    cost,
    coverage: usageRowCoverage,
    filters: z.record(z.string(), z.string()),
}

const usageBreakdownBase = {
    pagination,
    row_limit: z.strictObject({ limit: count, truncated: z.boolean() }),
    range,
}

const usageBreakdownResponse = z.discriminatedUnion('by', [
    z.strictObject({
        by: z.literal('model'),
        data: z.array(
            z.strictObject({
                provider: z.string(),
                model: z.string(),
                ...usageRowFigures,
            }),
        ),
        ...usageBreakdownBase,
    }),
    z.strictObject({
        by: z.literal('agent'),
        data: z.array(
            z.strictObject({ agent: z.string(), ...usageRowFigures }),
        ),
        ...usageBreakdownBase,
    }),
    z.strictObject({
        by: z.literal('provider'),
        data: z.array(
            z.strictObject({ provider: z.string(), ...usageRowFigures }),
        ),
        ...usageBreakdownBase,
    }),
])

const messageParts = ['prompt', 'response', 'activity'] as const
const toolCallLinks = [
    'linked',
    'awaiting_approval',
    'not_started',
    'unlinked',
] as const
const messagesStates = ['stored', 'partial', 'not_stored'] as const
const messagesReasons = [
    'span_limit',
    'offset_gap',
    'history_rewritten',
    'history_boundary_unknown',
    'step_input_missing',
] as const

expectTypeOf<(typeof messageParts)[number]>().toEqualTypeOf<MessagePart>()
expectTypeOf<(typeof toolCallLinks)[number]>().toEqualTypeOf<ToolCallLink>()
expectTypeOf<(typeof messagesStates)[number]>().toEqualTypeOf<MessagesState>()
expectTypeOf<(typeof messagesReasons)[number]>().toEqualTypeOf<MessagesReason>()

const toolCallSpan = z.strictObject({
    id: z.string(),
    status,
    issue_kind: nullable(z.enum(issueKinds)),
    duration_ms: nullable(z.number()),
})

const toolCallAgent = z.strictObject({
    span_id: z.string(),
    name: z.string(),
    agent_class: nullable(z.string()),
    status,
    issue_kind: nullable(z.enum(issueKinds)),
    provider: nullable(z.string()),
    model: nullable(z.string()),
    duration_ms: nullable(z.number()),
    pending_approvals: z.array(pendingApproval),
    resolved_tool_call_ids: z.array(z.string()),
})

const toolCall = z.strictObject({
    id: nullable(z.string()),
    name: nullable(z.string()),
    arguments: jsonValue,
    link: z.enum(toolCallLinks),
    span: nullable(toolCallSpan),
    agent: nullable(toolCallAgent),
})

const toolResult = z.strictObject({
    id: nullable(z.string()),
    name: nullable(z.string()),
    result: jsonValue,
    span_id: nullable(z.string()),
})

const messageSource = z.strictObject({
    span_id: z.string(),
    path: z.string(),
    redacted: z.boolean(),
    truncated: z.boolean(),
})

const message = z.strictObject({
    part: z.enum(messageParts),
    role: nullable(z.string()),
    content: jsonValue,
    structured: jsonValue,
    attachments: jsonValue,
    tool_calls: nullable(z.array(toolCall)),
    tool_results: nullable(z.array(toolResult)),
    source: messageSource,
    truncated_paths: z.record(z.string(), count),
})

const attempt = z.strictObject({
    attempt: count,
    provider: nullable(z.string()),
    model: nullable(z.string()),
    span_id: nullable(z.string()),
    error: nullable(traceError),
})

const turn = z.strictObject({
    trace,
    detail: traceDetail,
    root_span_id: nullable(z.string()),
    shown_attempt: nullable(count),
    attempts: z.array(attempt),
    messages_state: z.enum(messagesStates),
    messages_reason: nullable(z.enum(messagesReasons)),
    history_count: nullable(count),
    messages: z.array(message),
    span_limit: spanLimit,
})

const turnLimit = z.strictObject({
    limit: count,
    total: count,
    truncated: z.boolean(),
})

const transcriptWindow = z.strictObject({
    older: count,
    newer: count,
    anchor: nullable(
        z.strictObject({
            param: z.enum(['turn', 'before', 'after']),
            id: z.string(),
            found: z.boolean(),
        }),
    ),
})

const transcriptResponse = z.strictObject({
    data: z.strictObject({ conversation, turns: z.array(turn) }),
    turn_limit: turnLimit,
    window: transcriptWindow,
})

const bookmarkResponse = z.strictObject({
    data: z.strictObject({ trace_id: z.string(), bookmarked: z.boolean() }),
})

const traceNeighbours = z.strictObject({
    previous: nullable(z.string()),
    next: nullable(z.string()),
})

const traceNeighboursResponse = z.strictObject({ data: traceNeighbours })

const priceRates = z.strictObject({
    input: nullable(z.number()),
    output: nullable(z.number()),
    cache_read: nullable(z.number()),
    cache_write: nullable(z.number()),
})

const priceVia = z.strictObject({ model: z.string(), saved: z.boolean() })

const price = z.strictObject({
    provider: z.string(),
    model: z.string(),
    rates: priceRates,
    source: z.enum(['saved', 'config', 'prefix', 'none']),
    via: nullable(priceVia),
    default: z.strictObject({
        source: z.enum(['config', 'prefix', 'none']),
        via: nullable(priceVia),
        rates: priceRates,
    }),
    observed: z.boolean(),
    saved_at: nullable(timestamp),
})

const priceListResponse = z.strictObject({
    data: z.array(price),
    limit: z.strictObject({
        limit: count,
        total: count,
        truncated: z.boolean(),
    }),
})

const priceResponse = z.strictObject({ data: price })

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
            z.infer<typeof conversation>
        >().toEqualTypeOf<Conversation>()
        expectTypeOf<
            z.infer<typeof conversationCounts>
        >().toEqualTypeOf<ConversationCounts>()
        expectTypeOf<
            z.infer<typeof conversationListResponse>
        >().toEqualTypeOf<ConversationListResponse>()
        expectTypeOf<z.infer<typeof searchLimit>>().toEqualTypeOf<SearchLimit>()
        expectTypeOf<
            z.infer<typeof searchResponse>
        >().toEqualTypeOf<SearchResponse>()
        expectTypeOf<z.infer<typeof errorRate>>().toEqualTypeOf<ErrorRate>()
        expectTypeOf<
            z.infer<typeof summary>['duration']
        >().toEqualTypeOf<SummaryDuration>()
        expectTypeOf<z.infer<typeof summary>>().toEqualTypeOf<Summary>()
        expectTypeOf<
            z.infer<typeof seriesBucket>
        >().toEqualTypeOf<SeriesBucket>()
        expectTypeOf<
            z.infer<typeof previousRange>
        >().toEqualTypeOf<PreviousRange>()
        expectTypeOf<
            z.infer<typeof overviewResponse>
        >().toEqualTypeOf<OverviewResponse>()
        expectTypeOf<(typeof bucketUnits)[number]>().toEqualTypeOf<BucketUnit>()
        expectTypeOf<
            z.infer<typeof attentionResponse>
        >().toEqualTypeOf<AttentionResponse>()
        expectTypeOf<
            z.infer<typeof attentionItem>
        >().toEqualTypeOf<AttentionItem>()
        expectTypeOf<
            z.infer<typeof attentionRow>
        >().toEqualTypeOf<AttentionRow>()
        expectTypeOf<
            (typeof attentionKinds)[number]
        >().toEqualTypeOf<AttentionKind>()
        expectTypeOf<
            z.infer<typeof agentTopLevel>
        >().toEqualTypeOf<AgentTopLevel>()
        expectTypeOf<
            z.infer<typeof agentDelegated>
        >().toEqualTypeOf<AgentDelegated>()
        expectTypeOf<z.infer<typeof agent>>().toEqualTypeOf<Agent>()
        expectTypeOf<
            z.infer<typeof agentListResponse>
        >().toEqualTypeOf<AgentListResponse>()
        expectTypeOf<
            z.infer<typeof agentResponse>
        >().toEqualTypeOf<AgentResponse>()
        expectTypeOf<z.infer<typeof agentModel>>().toEqualTypeOf<AgentModel>()
        expectTypeOf<z.infer<typeof agentTool>>().toEqualTypeOf<AgentTool>()
        expectTypeOf<
            z.infer<typeof delegatedModel>
        >().toEqualTypeOf<DelegatedModel>()
        expectTypeOf<
            z.infer<typeof delegatedTool>
        >().toEqualTypeOf<DelegatedTool>()
        expectTypeOf<
            z.infer<typeof agentBreakdownResponse>
        >().toEqualTypeOf<AgentBreakdownResponse>()
        expectTypeOf<
            z.infer<typeof usageCoverage>
        >().toEqualTypeOf<UsageCoverage>()
        expectTypeOf<
            z.infer<typeof usageRowCoverage>
        >().toEqualTypeOf<UsageRowCoverage>()
        expectTypeOf<
            z.infer<typeof usageResponse>
        >().toEqualTypeOf<UsageResponse>()
        expectTypeOf<
            z.infer<typeof usageBreakdownResponse>
        >().toEqualTypeOf<UsageBreakdownResponse>()
        expectTypeOf<z.infer<typeof spendBucket>>().toEqualTypeOf<SpendBucket>()
        expectTypeOf<
            z.infer<typeof projectionWindow>
        >().toEqualTypeOf<ProjectionWindow>()
        expectTypeOf<
            z.infer<typeof projectedBucket>
        >().toEqualTypeOf<ProjectedBucket>()
        expectTypeOf<
            z.infer<typeof projectionLeftOut>
        >().toEqualTypeOf<ProjectionLeftOut>()
        expectTypeOf<
            z.infer<typeof spendProjection>
        >().toEqualTypeOf<SpendProjection>()
        expectTypeOf<
            z.infer<typeof usageSpendResponse>
        >().toEqualTypeOf<UsageSpendResponse>()
        expectTypeOf<
            z.infer<typeof traceNeighbours>
        >().toEqualTypeOf<TraceNeighbours>()
        expectTypeOf<
            z.infer<typeof traceNeighboursResponse>
        >().toEqualTypeOf<TraceNeighboursResponse>()
        expectTypeOf<z.infer<typeof priceRates>>().toEqualTypeOf<PriceRates>()
        expectTypeOf<z.infer<typeof price>>().toEqualTypeOf<Price>()
        expectTypeOf<
            z.infer<typeof priceListResponse>
        >().toEqualTypeOf<PriceListResponse>()
        expectTypeOf<
            z.infer<typeof priceResponse>
        >().toEqualTypeOf<PriceResponse>()
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

    it('match the schemas of the transcript', () => {
        expectTypeOf<
            z.infer<typeof toolCallSpan>
        >().toEqualTypeOf<ToolCallSpan>()
        expectTypeOf<
            z.infer<typeof toolCallAgent>
        >().toEqualTypeOf<ToolCallAgent>()
        expectTypeOf<z.infer<typeof toolCall>>().toEqualTypeOf<ToolCall>()
        expectTypeOf<z.infer<typeof toolResult>>().toEqualTypeOf<ToolResult>()
        expectTypeOf<
            z.infer<typeof messageSource>
        >().toEqualTypeOf<MessageSource>()
        expectTypeOf<z.infer<typeof message>>().toEqualTypeOf<Message>()
        expectTypeOf<z.infer<typeof attempt>>().toEqualTypeOf<Attempt>()
        expectTypeOf<z.infer<typeof turn>>().toEqualTypeOf<Turn>()
        expectTypeOf<z.infer<typeof turnLimit>>().toEqualTypeOf<TurnLimit>()
        expectTypeOf<
            z.infer<typeof transcriptWindow>
        >().toEqualTypeOf<TranscriptWindow>()
        expectTypeOf<
            z.infer<typeof transcriptResponse>
        >().toEqualTypeOf<TranscriptResponse>()
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

describe('tests/Contract/prices.json', () => {
    it('is what the API types describe', () => {
        expect(
            priceListResponse.safeParse(contractFixture('prices')).error
                ?.issues,
        ).toBeUndefined()
    })

    it('holds a model of every source, a free rate and a blank one', () => {
        const { data } = priceListResponse.parse(contractFixture('prices'))

        expect(new Set(data.map((p) => p.source))).toEqual(
            new Set(['saved', 'config', 'prefix', 'none']),
        )
        expect(data.some((p) => p.rates.cache_read === 0)).toBe(true)
        expect(data.some((p) => p.rates.cache_write === null)).toBe(true)
        expect(data.some((p) => p.via?.saved === true)).toBe(true)
        expect(data.some((p) => p.observed && p.source === 'none')).toBe(true)
    })
})

describe('tests/Contract/price.json', () => {
    it('is what the API types describe', () => {
        expect(
            priceResponse.safeParse(contractFixture('price')).error?.issues,
        ).toBeUndefined()
    })

    it('is a saved price with a time, whose default is the model it replaced', () => {
        const { data } = priceResponse.parse(contractFixture('price'))

        expect(data.source).toBe('saved')
        expect(data.saved_at).not.toBeNull()
        expect(data.default.source).toBe('prefix')
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

describe('tests/Contract/conversations.json', () => {
    const parsed = conversationListResponse.safeParse(
        contractFixture('conversations'),
    )

    it('is what the API types describe', () => {
        expect(parsed.error?.issues).toBeUndefined()
    })

    const rows = parsed.data?.data ?? []

    it('has a conversation in more than one cost state and one usage state', () => {
        expect(new Set(rows.map((c) => c.cost.state)).size).toBeGreaterThan(1)
        expect(new Set(rows.map((c) => c.usage.state)).size).toBeGreaterThan(1)
    })

    it('has conversations with one user, several and none', () => {
        expect(
            rows.some((c) => c.user_count === 0 && c.users.length === 0),
        ).toBe(true)
        expect(rows.some((c) => c.users.length === 1)).toBe(true)
        expect(rows.some((c) => c.users.length > 1)).toBe(true)
    })

    it('counts the conversations the way its pagination does', () => {
        expect(parsed.data?.counts.all).toBe(parsed.data?.pagination.total)
    })
})

describe('tests/Contract/overview.json', () => {
    const parsed = overviewResponse.safeParse(contractFixture('overview'))

    it('is what the API types describe', () => {
        expect(parsed.error?.issues).toBeUndefined()
    })

    const data = parsed.data?.data
    const buckets = data?.series.buckets ?? []

    it('sums up the range and the period before it', () => {
        expect(data?.summary.runs.all).toBeGreaterThan(0)
        expect(data?.previous?.runs.all).toBeGreaterThan(0)
        expect(parsed.data?.previous_range.to).toBe(parsed.data?.range.from)
    })

    it('has a percentile and a missing one', () => {
        expect(data?.summary.duration.p95_ms).not.toBeNull()
        expect(data?.previous?.duration.p95_ms).toBeNull()
    })

    it('has a series cut at both ends, the last bucket still open', () => {
        expect(buckets[0]?.full).toBe(false)
        expect(buckets.at(-1)?.full).toBe(false)
        expect(buckets.map((bucket) => bucket.in_progress)).toEqual([
            ...buckets.slice(0, -1).map(() => false),
            true,
        ])
        expect(buckets[0]?.from).toBe(parsed.data?.range.from)
        expect(buckets.at(-1)?.to).toBe(parsed.data?.range.to)
    })

    it('has buckets with runs and buckets without', () => {
        expect(buckets.some((bucket) => bucket.runs.all === 0)).toBe(true)
        expect(buckets.some((bucket) => bucket.runs.all > 0)).toBe(true)
    })

    it('adds up to its summary', () => {
        const total = buckets.reduce((sum, bucket) => sum + bucket.runs.all, 0)
        expect(total).toBe(data?.summary.runs.all)
    })
})

describe('tests/Contract/attention.json', () => {
    const parsed = attentionResponse.safeParse(contractFixture('attention'))

    it('is what the API types describe', () => {
        expect(parsed.error?.issues).toBeUndefined()
    })

    const items = parsed.data?.data ?? []

    it('has every kind once, in the order of the kinds', () => {
        expect(items.map((item) => item.kind)).toEqual([...attentionKinds])
    })

    it('has a breakdown on the failed item and on no other', () => {
        for (const item of items) {
            expect(item.breakdown.length > 0).toBe(item.kind === 'failed')
        }
    })

    it('has a breakdown of more than one row, whose rows add to no more than the count', () => {
        const failed = items.find((item) => item.kind === 'failed')

        expect(failed?.breakdown.length).toBeGreaterThan(1)
        expect(
            failed?.breakdown.reduce((sum, row) => sum + row.count, 0),
        ).toBeLessThanOrEqual(failed?.count ?? 0)
    })

    it('has no item for a count of zero', () => {
        expect(items.every((item) => item.count > 0)).toBe(true)
    })
})

describe('tests/Contract/agents.json', () => {
    const parsed = agentListResponse.safeParse(contractFixture('agents'))

    it('is what the API types describe', () => {
        expect(parsed.error?.issues).toBeUndefined()
    })

    const agents = parsed.data?.data ?? []

    it('has an agent with runs only, one with both, one only delegated to and an embeddings one', () => {
        expect(
            agents.some((a) => a.top_level !== null && a.delegated === null),
        ).toBe(true)
        expect(
            agents.some((a) => a.top_level !== null && a.delegated !== null),
        ).toBe(true)
        expect(
            agents.some((a) => a.top_level === null && a.delegated !== null),
        ).toBe(true)
        expect(agents.some((a) => a.type === 'embedding')).toBe(true)
    })

    it('counts the activity of an agent in the buckets it describes, and none for an agent without runs', () => {
        const edges = parsed.data?.buckets.edges ?? []

        for (const a of agents) {
            expect(a.activity).toHaveLength(edges.length)
            expect(a.activity.reduce((sum, n) => sum + n, 0)).toBe(
                a.top_level?.runs.all ?? 0,
            )
        }
    })

    it('has an agent whose latest activity is a delegation', () => {
        expect(
            agents.some(
                (a) =>
                    a.delegated?.last_activity_at != null &&
                    a.last_activity_at === a.delegated.last_activity_at,
            ),
        ).toBe(true)
    })

    it('has a failed delegation and a failed run', () => {
        expect(agents.some((a) => (a.delegated?.failed ?? 0) > 0)).toBe(true)
        expect(agents.some((a) => (a.top_level?.runs.failed ?? 0) > 0)).toBe(
            true,
        )
    })
})

describe('tests/Contract/search.json', () => {
    const parsed = searchResponse.safeParse(contractFixture('search'))

    it('is what the API types describe', () => {
        expect(parsed.error?.issues).toBeUndefined()
    })

    const data = parsed.data?.data

    it('has something in every group, searched for a text of the minimum length', () => {
        expect(data?.traces.length).toBeGreaterThan(0)
        expect(data?.conversations.length).toBeGreaterThan(0)
        expect(data?.agents.length).toBeGreaterThan(0)
        expect(parsed.data?.query.searched).toBe(true)
        expect(parsed.data?.query.q.length).toBeGreaterThanOrEqual(
            parsed.data?.query.minimum ?? Infinity,
        )
    })

    it('holds no more in a group than its limit', () => {
        for (const group of ['traces', 'conversations', 'agents'] as const) {
            expect(data?.[group].length).toBeLessThanOrEqual(
                parsed.data?.limits[group].limit ?? 0,
            )
        }
    })
})

describe('tests/Contract/agent.json', () => {
    const parsed = agentResponse.safeParse(contractFixture('agent'))

    it('is what the API types describe', () => {
        expect(parsed.error?.issues).toBeUndefined()
    })

    const data = parsed.data?.data

    it('has the agent’s own runs as its summary', () => {
        expect(data?.summary.runs).toEqual(data?.agent.top_level?.runs)
    })

    it('has a previous period, a percentile and what needs a look filtered by the agent', () => {
        expect(data?.previous?.runs.all).toBeGreaterThan(0)
        expect(data?.summary.duration.p95_ms).not.toBeNull()
        expect(data?.attention.length).toBeGreaterThan(0)

        for (const item of data?.attention ?? []) {
            expect(item.filters.agent).toBe(data?.agent.name)

            for (const row of item.breakdown) {
                expect(row.filters.agent).toBe(data?.agent.name)
            }
        }
    })
})

describe('tests/Contract/agent-breakdown.json', () => {
    const parsed = agentBreakdownResponse.safeParse(
        contractFixture('agent-breakdown'),
    )

    it('is what the API types describe', () => {
        expect(parsed.error?.issues).toBeUndefined()
    })

    const data = parsed.data?.data

    it('has models and tools of the runs, with the parameters that list them, and of the delegated runs, without', () => {
        expect(data?.models.length).toBeGreaterThan(0)
        expect(data?.tools.length).toBeGreaterThan(0)
        expect(data?.delegated.models.length).toBeGreaterThan(0)
        expect(data?.delegated.tools.length).toBeGreaterThan(0)

        for (const row of [...(data?.models ?? []), ...(data?.tools ?? [])]) {
            expect(row.filters.agent).toBeTypeOf('string')
        }
    })

    it('says how many there are beside the rows', () => {
        expect(parsed.data?.limits.models.total).toBe(data?.models.length)
        expect(parsed.data?.limits.tools.total).toBe(data?.tools.length)
    })
})

describe('tests/Contract/usage.json', () => {
    const parsed = usageResponse.safeParse(contractFixture('usage'))

    it('is what the API types describe', () => {
        expect(parsed.error?.issues).toBeUndefined()
    })

    it('has a run still running, so its usage and cost are pending, and a step that could not be priced', () => {
        const data = parsed.data?.data

        expect(data?.summary.runs.running).toBeGreaterThan(0)
        expect(data?.summary.cost.state).toBe('pending')
        expect(data?.coverage.unpriced_steps).toBeGreaterThan(0)
    })
})

describe('tests/Contract/usage-breakdown.json', () => {
    const parsed = usageBreakdownResponse.safeParse(
        contractFixture('usage-breakdown'),
    )

    it('is what the API types describe', () => {
        expect(parsed.error?.issues).toBeUndefined()
    })

    it('has a pending partly priced row and a row that reported nothing, each with the filters that list its runs', () => {
        const rows = parsed.data?.data ?? []

        expect(rows.some((row) => row.cost.state === 'pending')).toBe(true)
        expect(rows.some((row) => row.usage.state === 'not_reported')).toBe(
            true,
        )

        for (const row of rows) {
            expect(Object.keys(row.filters).length).toBeGreaterThan(0)
        }
    })
})

describe('tests/Contract/usage-spend.json', () => {
    const parsed = usageSpendResponse.safeParse(contractFixture('usage-spend'))

    it('is what the API types describe', () => {
        expect(parsed.error?.issues).toBeUndefined()
    })

    it('has buckets with and without a cumulative amount, the last one pending', () => {
        const buckets = parsed.data?.data.series.buckets ?? []

        expect(
            buckets.some((bucket) => bucket.cumulative.amount === null),
        ).toBe(true)
        expect(
            buckets.some((bucket) => bucket.cumulative.amount !== null),
        ).toBe(true)
        expect(buckets.at(-1)?.cumulative.state).toBe('pending')
    })

    it('is projected, with buckets that continue the recorded line and something left out', () => {
        const projection = parsed.data?.data.projection

        expect(projection?.state).toBe('projected')
        expect(projection?.buckets.length).toBeGreaterThan(0)
        expect(projection?.left_out.unfinished_runs).toBeGreaterThan(0)
    })
})

describe('tests/Contract/conversation.json', () => {
    const parsed = transcriptResponse.safeParse(contractFixture('conversation'))

    it('is what the API types describe', () => {
        expect(parsed.error?.issues).toBeUndefined()
    })

    const { data, window } = parsed.data ?? {
        data: { conversation: undefined, turns: [] },
        window: undefined,
    }
    const messages = data.turns.flatMap((t) => t.messages)

    it('has turns in order, with the conversation’s own count of them', () => {
        expect(data.turns.length).toBeGreaterThan(1)
        expect(data.conversation?.turns.all).toBe(data.turns.length)
        expect(window?.older).toBe(0)
    })

    it('has every part of a message, and a linked and an unlinked kind of call', () => {
        expect(new Set(messages.map((m) => m.part))).toEqual(
            new Set(messageParts),
        )
        expect(
            new Set(
                messages
                    .flatMap((m) => m.tool_calls ?? [])
                    .map((call) => call.link),
            ),
        ).toEqual(new Set(['linked', 'awaiting_approval']))
    })

    it('has a delegated agent and a cut result', () => {
        expect(
            messages
                .flatMap((m) => m.tool_calls ?? [])
                .some((call) => call.agent !== null),
        ).toBe(true)
        expect(
            messages.some((m) => Object.keys(m.truncated_paths).length > 0),
        ).toBe(true)
    })

    it('has a run that failed over to another attempt', () => {
        expect(data.turns.some((t) => t.attempts.length > 1)).toBe(true)
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
